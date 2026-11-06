// Private connectivity for a SLOMP environment: one Private Endpoint in
// snet-pe per sub-resource of the Key Vault and the Storage Account (vault,
// blob, queue), each with its Private DNS zone linked to the VNet, so the
// service names resolve to a private IP from inside the VNet (SL-64).
//
// Out of scope:
// - Azure OpenAI Private Endpoint (also in the SL-64 ticket): no OpenAI
//   resource exists in infra/ yet and its use case is still undefined
//   (RF-18). Add one more entry to `endpoints` (groupId 'account', zone
//   privatelink.openai.azure.com) when oai-predial-dev is created.
// - Disabling the public endpoints of the Key Vault / Storage Account. Both
//   stay reachable publicly (storage-security.bicep, SL-63); closing them
//   needs the deployment pipeline and the Function App deployment package
//   to be able to reach them privately first.
// - PostgreSQL: data.bicep already creates its own Private DNS zone (it is
//   VNet-injected, not a Private Endpoint).
//
// The Key Vault zone name is the Azure public cloud one (the only cloud this
// project targets); the storage ones follow environment().suffixes.storage.
//
// Deploy at resource group scope (az deployment group create -g <rg> ...).

@description('Location for the Private Endpoints. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Resource ID of the VNet (network.bicep output vnetId). Every Private DNS zone gets linked to it.')
param vnetId string

@description('Resource ID of snet-pe, the subnet the Private Endpoints live in.')
param peSubnetId string

@description('Resource ID of the Key Vault (storage-security.bicep output keyVaultId).')
param keyVaultId string

@description('Resource ID of the Storage Account (storage-security.bicep output storageAccountId).')
param storageAccountId string

var endpoints = [
  {
    name: 'pe-keyvault-predial-dev'
    targetId: keyVaultId
    groupId: 'vault'
    zoneName: 'privatelink.vaultcore.azure.net'
  }
  {
    name: 'pe-storage-blob-predial-dev'
    targetId: storageAccountId
    groupId: 'blob'
    zoneName: 'privatelink.blob.${environment().suffixes.storage}'
  }
  {
    name: 'pe-storage-queue-predial-dev'
    targetId: storageAccountId
    groupId: 'queue'
    zoneName: 'privatelink.queue.${environment().suffixes.storage}'
  }
]

resource privateDnsZones 'Microsoft.Network/privateDnsZones@2020-06-01' = [
  for endpoint in endpoints: {
    name: endpoint.zoneName
    location: 'global'
  }
]

resource privateDnsZoneVnetLinks 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = [
  for (endpoint, i) in endpoints: {
    parent: privateDnsZones[i]
    name: '${endpoint.zoneName}-link'
    location: 'global'
    properties: {
      registrationEnabled: false
      virtualNetwork: {
        id: vnetId
      }
    }
  }
]

resource privateEndpoints 'Microsoft.Network/privateEndpoints@2023-11-01' = [
  for endpoint in endpoints: {
    name: endpoint.name
    location: location
    properties: {
      subnet: {
        id: peSubnetId
      }
      privateLinkServiceConnections: [
        {
          name: endpoint.name
          properties: {
            privateLinkServiceId: endpoint.targetId
            groupIds: [
              endpoint.groupId
            ]
          }
        }
      ]
    }
  }
]

// Registers the endpoint's private IP as an A record in its zone — without
// this the zone is linked but empty and the name keeps resolving publicly.
resource privateDnsZoneGroups 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = [
  for (endpoint, i) in endpoints: {
    parent: privateEndpoints[i]
    name: 'default'
    dependsOn: [
      privateDnsZoneVnetLinks
    ]
    properties: {
      privateDnsZoneConfigs: [
        {
          name: 'config'
          properties: {
            privateDnsZoneId: privateDnsZones[i].id
          }
        }
      ]
    }
  }
]

output privateEndpointNames array = [for (endpoint, i) in endpoints: privateEndpoints[i].name]
