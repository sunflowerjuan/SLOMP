// Storage and secrets for a SLOMP environment: a Storage Account (Blob +
// Queue) and a Key Vault, with the App Service and Function App's existing
// System-Assigned identities (from compute.bicep, SL-61) granted read
// access to both via Azure RBAC role assignments — no new identity is
// created here, "Managed Identity System-Assigned" in the SL-63 ticket
// refers to the ones compute.bicep already provisioned.
//
// The default storage account name/container match what compute.dev.bicepparam
// already hardcodes as the Function App's deployment package location
// (SL-61) — deploying this module is what makes that reference resolve to a
// real resource instead of a dangling name.
//
// Out of scope (other tickets):
// - Private Endpoints for the Storage Account / Key Vault (SL-64,
//   connectivity.bicep) — both stay on their public endpoint for now.
// - Migrating data.bicep's PostgreSQL admin password to a Key Vault secret
//   (still an environment variable today, see data.bicep) — a follow-up
//   once this Key Vault exists, not part of this deliverable.
// - The PDF queue's actual consumer (QueueTrigger code) — HU14/SL-51 is in
//   the backlog. This module only provisions the empty queue.
//
// Deploy at resource group scope (az deployment group create -g <rg> ...).

@description('Location for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Name of the Storage Account. Storage account names allow only lowercase letters and digits (no hyphens), 3-24 chars.')
param storageAccountName string = 'stpredialdev'

@description('Storage Account replication SKU.')
param storageAccountSku string = 'Standard_LRS'

@description('Blob container for the Function App deployment package (must match compute.bicep\'s deploymentStorageContainerName).')
param deploymentPackageContainerName string = 'fn-pdf-deploymentpackage'

@description('Blob container for the municipality .docx templates.')
param templatesContainerName string = 'templates'

@description('Queue for PDF generation jobs.')
param pdfQueueName string = 'stq-predial-dev'

@description('Name of the Key Vault.')
param keyVaultName string = 'kv-predial-dev'

@description('principalId of the backend App Service\'s System-Assigned identity (compute.bicep output appServicePrincipalId).')
param appServicePrincipalId string

@description('principalId of the Function App\'s System-Assigned identity (compute.bicep output functionAppPrincipalId).')
param functionAppPrincipalId string

var identityPrincipalIds = [
  appServicePrincipalId
  functionAppPrincipalId
]
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'
var storageBlobDataReaderRoleId = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  kind: 'StorageV2'
  sku: {
    name: storageAccountSku
  }
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource deploymentPackageContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobServices
  name: deploymentPackageContainerName
}

resource templatesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobServices
  name: templatesContainerName
}

resource queueServices 'Microsoft.Storage/storageAccounts/queueServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource pdfQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueServices
  name: pdfQueueName
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
  }
}

resource keyVaultSecretsUserAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in identityPrincipalIds: {
    name: guid(keyVault.id, principalId, keyVaultSecretsUserRoleId)
    scope: keyVault
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
      principalId: principalId
      principalType: 'ServicePrincipal'
    }
  }
]

resource storageBlobDataReaderAssignments 'Microsoft.Authorization/roleAssignments@2022-04-01' = [
  for principalId in identityPrincipalIds: {
    name: guid(storageAccount.id, principalId, storageBlobDataReaderRoleId)
    scope: storageAccount
    properties: {
      roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', storageBlobDataReaderRoleId)
      principalId: principalId
      principalType: 'ServicePrincipal'
    }
  }
]

output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
output keyVaultId string = keyVault.id
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
