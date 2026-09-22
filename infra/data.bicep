// PostgreSQL for a SLOMP environment: an Azure Database for PostgreSQL
// Flexible Server with NO public endpoint. Deployed in "Private access
// (VNet integration)" mode, into snet-data (already delegated to
// Microsoft.DBforPostgreSQL/flexibleServers by network.bicep, SL-60) — that
// delegated-subnet mode is mutually exclusive with the "Public access"
// mode's firewall rules / publicNetworkAccess property, so there is no
// public endpoint to disable: none is ever created.
//
// A VNet-integrated flexible server also requires a Private DNS zone linked
// to that same VNet (an Azure requirement for name resolution, independent
// of snet-pe / Private Endpoints for other services — that's SL-64's
// connectivity.bicep). This module creates that zone and its VNet link too,
// since neither makes sense deployed on its own.
//
// Storage and Key Vault are NOT created here (SL-63) — until Key Vault
// exists, the admin password is sourced from an environment variable in
// the parameter file (see data.dev.bicepparam), never committed.
//
// Deploy at resource group scope (az deployment group create -g <rg> ...).

@description('Location for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Name of the PostgreSQL Flexible Server.')
param serverName string = 'psql-predial-dev'

@description('PostgreSQL major version.')
param postgresVersion string = '16'

@description('Administrator login name. Not a secret by itself, but useless without administratorLoginPassword.')
param administratorLogin string = 'pgadmin'

@secure()
@description('Administrator password. No default on purpose — always pass it explicitly (an environment variable via readEnvironmentVariable() in the .bicepparam file, never a literal).')
param administratorLoginPassword string

@description('SKU name. B1ms is the Burstable-tier size for this environment.')
param skuName string = 'Standard_B1ms'

@description('SKU tier for skuName.')
param skuTier string = 'Burstable'

@description('Provisioned storage, in GiB. 32 is the minimum for the Burstable tier.')
param storageSizeGB int = 32

@description('Backup retention, in days.')
param backupRetentionDays int = 7

@description('Resource ID of snet-data (from network.bicep, SL-60). Must already be delegated to Microsoft.DBforPostgreSQL/flexibleServers.')
param dataSubnetId string

@description('Resource ID of the VNet (from network.bicep, SL-60). The Private DNS zone this module creates gets linked to it.')
param vnetId string

@description('Name of the Private DNS zone for the server. Must end in "postgres.database.azure.com" (Azure requirement for VNet-integrated flexible servers).')
param privateDnsZoneName string = '${serverName}.private.postgres.database.azure.com'

resource privateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: privateDnsZoneName
  location: 'global'
}

resource privateDnsZoneVnetLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: privateDnsZone
  name: '${privateDnsZoneName}-link'
  location: 'global'
  properties: {
    virtualNetwork: {
      id: vnetId
    }
    registrationEnabled: false
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: serverName
  location: location
  sku: {
    name: skuName
    tier: skuTier
  }
  properties: {
    version: postgresVersion
    administratorLogin: administratorLogin
    administratorLoginPassword: administratorLoginPassword
    storage: {
      storageSizeGB: storageSizeGB
    }
    backup: {
      backupRetentionDays: backupRetentionDays
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: dataSubnetId
      privateDnsZoneArmResourceId: privateDnsZone.id
    }
    // No `network.publicNetworkAccess` and no `firewallRules` child
    // resource: both only exist in the mutually exclusive "Public access"
    // mode. delegatedSubnetResourceId above IS what removes the public
    // endpoint (SL-62 acceptance criterion) — Azure never provisions one
    // for a VNet-integrated server, so there is nothing further to disable.
  }
  // The server's DNS name only resolves correctly once the zone is linked
  // to the VNet; Azure also validates the link exists at creation time.
  // Not inferred automatically because `postgres` only references
  // `privateDnsZone.id` above, not the link resource.
  dependsOn: [
    privateDnsZoneVnetLink
  ]
}

output serverId string = postgres.id
output serverName string = postgres.name
output fullyQualifiedDomainName string = postgres.properties.fullyQualifiedDomainName
output privateDnsZoneId string = privateDnsZone.id
