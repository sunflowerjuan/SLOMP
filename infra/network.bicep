// Base network for a SLOMP environment: VNet, 5 subnets, NSGs for snet-app
// and snet-data, and the snet-fn / snet-data delegations. Deploy at resource
// group scope (az deployment group create -g <rg> ...).
//
// Application Gateway, App Service, Function App and PostgreSQL are NOT
// created here (SL-61 / SL-62) — this module only prepares the subnets they
// will live in.

@description('Location for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('VNet name.')
param vnetName string = 'vnet-predial-dev'

@description('VNet address space.')
param vnetAddressPrefix string = '10.1.0.0/16'

@description('Address prefix for snet-agw (reserved for the Application Gateway).')
param agwSubnetPrefix string = '10.1.4.0/24'

@description('Address prefix for snet-app (backend App Service, VNet Integration).')
param appSubnetPrefix string = '10.1.1.0/24'

@description('Address prefix for snet-fn (PDF generator Function App).')
param fnSubnetPrefix string = '10.1.5.0/24'

@description('Address prefix for snet-pe (Private Endpoints).')
param peSubnetPrefix string = '10.1.3.0/24'

@description('Address prefix for snet-data (PostgreSQL Flexible Server).')
param dataSubnetPrefix string = '10.1.2.0/24'

@description('Name of the NSG attached to snet-app.')
param nsgAppName string = 'nsg-app-predial-dev'

@description('Name of the NSG attached to snet-data.')
param nsgDataName string = 'nsg-data-predial-dev'

resource nsgApp 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: nsgAppName
  location: location
  properties: {
    securityRules: [
      {
        name: 'AllowFromAgw'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: '*'
          sourceAddressPrefix: agwSubnetPrefix
          sourcePortRange: '*'
          destinationAddressPrefix: appSubnetPrefix
          destinationPortRange: '*'
        }
      }
    ]
    // Everything else is denied by the platform's implicit DenyAllInBound
    // default rule (priority 65500) — no explicit deny rule needed.
  }
}

resource nsgData 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: nsgDataName
  location: location
  properties: {
    securityRules: [
      {
        name: 'AllowPostgresFromAppAndFn'
        properties: {
          priority: 100
          direction: 'Inbound'
          access: 'Allow'
          protocol: 'Tcp'
          sourceAddressPrefixes: [
            appSubnetPrefix
            fnSubnetPrefix
          ]
          sourcePortRange: '*'
          destinationAddressPrefix: dataSubnetPrefix
          destinationPortRange: '5432'
        }
      }
    ]
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        vnetAddressPrefix
      ]
    }
    subnets: [
      {
        name: 'snet-agw'
        properties: {
          addressPrefix: agwSubnetPrefix
        }
      }
      {
        name: 'snet-app'
        properties: {
          addressPrefix: appSubnetPrefix
          networkSecurityGroup: {
            id: nsgApp.id
          }
        }
      }
      {
        name: 'snet-fn'
        properties: {
          addressPrefix: fnSubnetPrefix
          delegations: [
            {
              name: 'delegation-fn'
              properties: {
                serviceName: 'Microsoft.App/environments'
              }
            }
          ]
        }
      }
      {
        name: 'snet-pe'
        properties: {
          addressPrefix: peSubnetPrefix
        }
      }
      {
        name: 'snet-data'
        properties: {
          addressPrefix: dataSubnetPrefix
          networkSecurityGroup: {
            id: nsgData.id
          }
          delegations: [
            {
              name: 'delegation-data'
              properties: {
                serviceName: 'Microsoft.DBforPostgreSQL/flexibleServers'
              }
            }
          ]
        }
      }
    ]
  }
}

output vnetId string = vnet.id
output vnetName string = vnet.name
