// Compute for a SLOMP environment: the backend App Service and the PDF
// generator Function App. Depends on network.bicep (SL-60) already having
// created snet-app and snet-fn — this module only takes their resourceId as
// a parameter, it does not create or modify the VNet.
//
// PostgreSQL, Storage and Key Vault are NOT created here (SL-62/SL-63) — the
// Function App's deployment storage is only referenced by name/container.
// No application code or business logic lives here, this is infrastructure
// only: both apps are deployed empty and get their code from a separate
// pipeline.
//
// Deploy at resource group scope (az deployment group create -g <rg> ...).

@description('Location for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Name of the backend App Service Plan (Linux).')
param appServicePlanName string = 'asp-predial-dev'

@description('SKU of the backend App Service Plan. Must support VNet Integration (B1 does not).')
param appServicePlanSku string = 'S1'

@description('Name of the backend App Service.')
param appServiceName string = 'app-predial-dev'

@description('Resource ID of the subnet the backend App Service integrates with (snet-app, from network.bicep).')
param appSubnetId string

@description('Name of the PDF generator Function Plan (Flex Consumption).')
param functionPlanName string = 'plan-fn-predial-dev'

@description('SKU name of the Function Plan. Flex Consumption is "FC1".')
param functionPlanSkuName string = 'FC1'

@description('SKU tier of the Function Plan. Flex Consumption is "FlexConsumption".')
param functionPlanSkuTier string = 'FlexConsumption'

@description('Name of the PDF generator Function App.')
param functionAppName string = 'fn-pdf-predial-dev'

@description('Resource ID of the subnet the Function App integrates with (snet-fn, from network.bicep). Must be delegated to Microsoft.App/environments for Flex Consumption.')
param fnSubnetId string

@description('Number of "always ready" Flex Consumption instances for the Function App. 0 keeps the base cost at $0 (Azure for Students budget) but keeps a cold start on the first invocation. Production may need 1 to meet RNF-01 (5s PDF delivery) — see ADR-7.')
param functionAppAlwaysReadyInstanceCount int = 0

@description('Maximum number of Flex Consumption instances the Function App can scale to.')
param functionAppMaximumInstanceCount int = 100

@description('Memory (MB) allocated per Flex Consumption instance.')
param functionAppInstanceMemoryMB int = 2048

@description('Name of the Storage Account holding the Function App deployment package (from SL-63, not created here).')
param deploymentStorageAccountName string

@description('Name of the blob container holding the Function App deployment package (from SL-63, not created here).')
param deploymentStorageContainerName string

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  kind: 'linux'
  sku: {
    name: appServicePlanSku
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
    httpsOnly: true
    virtualNetworkSubnetId: appSubnetId
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      minTlsVersion: '1.2'
      ftpsState: 'FtpsOnly'
      vnetRouteAllEnabled: true
    }
  }
}

// Easy Auth stays off: the backend authenticates requests itself with JWT
// (CLAUDE.md), it doesn't delegate to App Service Authentication. Declared
// explicitly so static analysis (SonarQube) sees this is deliberate, not an
// omission.
resource appServiceAuthSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: appService
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: false
    }
  }
}

resource functionPlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: functionPlanName
  location: location
  kind: 'functionapp,linux'
  sku: {
    name: functionPlanSkuName
    tier: functionPlanSkuTier
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
    httpsOnly: true
    virtualNetworkSubnetId: fnSubnetId
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'FtpsOnly'
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
      runtime: {
        name: 'node'
        version: '20'
      }
      scaleAndConcurrency: {
        instanceMemoryMB: functionAppInstanceMemoryMB
        maximumInstanceCount: functionAppMaximumInstanceCount
        alwaysReady: functionAppAlwaysReadyInstanceCount > 0 ? [
          {
            name: 'http'
            instanceCount: functionAppAlwaysReadyInstanceCount
          }
        ] : []
      }
    }
  }
}

// Same reasoning as appServiceAuthSettings above: the Function App has no
// HTTP-facing auth of its own yet (empty infra, no code deployed), Easy Auth
// off is declared explicitly rather than left implicit.
resource functionAppAuthSettings 'Microsoft.Web/sites/config@2023-12-01' = {
  parent: functionApp
  name: 'authsettingsV2'
  properties: {
    platform: {
      enabled: false
    }
  }
}

output appServiceId string = appService.id
output appServiceName string = appService.name
output appServicePrincipalId string = appService.identity.principalId
output functionAppId string = functionApp.id
output functionAppName string = functionApp.name
output functionAppPrincipalId string = functionApp.identity.principalId
