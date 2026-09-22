// Public hosting for apps/frontend (SL-69).
//
// DEVIATION FROM THE TICKET/arquitectura.md (documented, not silent): the
// ticket and arquitectura.md 3.3/3.8 call for an actual Azure Static Web
// App (Microsoft.Web/staticSites, stapp-predial-dev). That resource type is
// only available in centralus/eastus2/westus2/westeurope/eastasia — and
// this subscription's region-restriction policy (sys.regionrestriction)
// only allows canadacentral/mexicocentral/northcentralus/westus3/
// chilecentral. There is NO overlap, so Static Web Apps cannot be deployed
// at all on this subscription today (confirmed against the real policy
// assignment, not a guess) — contacting Azure support to add a compatible
// region is the ticket's own suggested path but isn't realistic for a
// same-day demo.
//
// Instead: a Storage Account with static website hosting enabled (a native
// Storage feature, no region restriction — northcentralus, same as every
// other module, works fine). Functionally equivalent for this project's
// needs (a public URL serving the built SPA) at Free-tier-equivalent cost
// (Storage's static website hosting has no fixed hourly charge, only
// consumption, negligible at this traffic level).
//
// Static website hosting itself (the "$web" container + index/error
// document config) is a data-plane setting, not exposed by the
// Microsoft.Storage ARM API — Bicep can only create the storage account.
// Enabling it and uploading the built frontend both happen via
// `az storage blob service-properties update --static-website` /
// `az storage blob upload-batch` after this deploys — see
// .claude/review.md for the exact commands.
//
// Out of scope (SL-69 ticket): wiring the frontend to the real backend API
// (SL-54), a custom domain, any CI/CD pipeline for future deploys.
//
// Deploy at resource group scope (az deployment group create -g <rg> ...).

@description('Location for the Storage Account. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Name of the Storage Account hosting the frontend static website. Storage account names allow only lowercase letters and digits (no hyphens), 3-24 chars.')
param storageAccountName string = 'stfrontendpredialdev'

@description('Storage Account replication SKU.')
param storageAccountSku string = 'Standard_LRS'

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
    // Public read access is the point here, unlike storage-security.bicep's
    // account — a static website has to be anonymously readable to work.
    allowBlobPublicAccess: true
  }
}

output storageAccountId string = storageAccount.id
output storageAccountName string = storageAccount.name
output staticWebsiteEndpoint string = storageAccount.properties.primaryEndpoints.web
