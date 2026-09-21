// Compute resources for a SLOMP environment: the backend App Service and the
// PDF generator Function App, both with regional VNet Integration into the
// subnets network.bicep (SL-60) provisions (snet-app and snet-fn).
// Deploy at resource group scope (az deployment group create -g <rg> ...).
//
// PostgreSQL, Storage and Key Vault are NOT created here (SL-62 / SL-63) —
// this module only provisions compute. The Function App's deployment
// storage container is referenced by name, not created here.

@description('Location for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Resource ID of the subnet the backend App Service integrates with (snet-app).')
param appSubnetId string

@description('Resource ID of the subnet the Function App integrates with (snet-fn).')
param fnSubnetId string

@description('Name of the App Service Plan (backend).')
param appServicePlanName string = 'asp-predial-dev'

@description('SKU name of the App Service Plan, e.g. S1.')
param appServicePlanSkuName string = 'S1'

@description('SKU tier of the App Service Plan, e.g. Standard.')
param appServicePlanSkuTier string = 'Standard'

@description('Name of the backend App Service.')
param appServiceName string = 'app-predial-dev'

@description('Name of the Function App plan (Flex Consumption).')
param functionPlanName string = 'plan-fn-predial-dev'

@description('Name of the PDF generator Function App.')
param functionAppName string = 'fn-pdf-predial-dev'

@description('Number of "always ready" instances for the Function App. Keep at 0 to stay at $0 base cost; production may need 1 to avoid cold start on the PDF generator — see the open ADR-7 point.')
param functionAppAlwaysReadyInstanceCount int = 0

@description('Always-ready scale group name, required only when functionAppAlwaysReadyInstanceCount > 0. Must match the deployed function\'s trigger group (e.g. "function:<FunctionName>" for the PDF QueueTrigger) once that function exists.')
param functionAppAlwaysReadyGroupName string = 'http'

@description('Storage account name backing the Function App deployment package (created in SL-63).')
param deploymentStorageAccountName string

@description('Blob container name backing the Function App deployment package (created in SL-63).')
param deploymentStorageContainerName string = 'fn-pdf-deploymentpackage'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: appServicePlanSkuName
    tier: appServicePlanSkuTier
  }
  properties: {
    reserved: true
  }
}

resource appService 'Microsoft.Web/sites@2023-12-01' = {
  name: appServiceName
  location: location
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    virtualNetworkSubnetId: appSubnetId
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      vnetRouteAllEnabled: true
    }
  }
}

resource functionPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: functionPlanName
  location: location
  kind: 'functionapp,linux'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
    capacity: 0
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: functionPlan.id
    virtualNetworkSubnetId: fnSubnetId
    siteConfig: {
      vnetRouteAllEnabled: true
    }
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: 'https://${deploymentStorageAccountName}.blob.${environment().suffixes.storage}/${deploymentStorageContainerName}'
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: 100
        instanceMemoryMB: 2048
        alwaysReady: functionAppAlwaysReadyInstanceCount > 0 ? [
          {
            name: functionAppAlwaysReadyGroupName
            instanceCount: functionAppAlwaysReadyInstanceCount
          }
        ] : []
      }
      runtime: {
        name: 'node'
        version: '20'
      }
    }
  }
}

output appServicePlanId string = appServicePlan.id
output appServiceId string = appService.id
output appServiceName string = appService.name
output functionPlanId string = functionPlan.id
output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
