// Orchestrator for a full SLOMP environment: chains every module in
// infra/ into one deployment instead of running each `az deployment group
// create` by hand in the right order. Bicep infers the dependency graph
// from the module references below (compute → storageSecurity →
// gateway/monitor, etc.) — no manual `dependsOn` needed except where noted.
//
// connectivity.bicep (SL-64, Private Endpoints + Private DNS Zones) is NOT
// wired in here — that module doesn't exist yet (still "Tareas por hacer"),
// so there's nothing to reference. Add it here once SL-64 lands.
//
// Everything else defaults to each module's own dev-appropriate parameter
// values (declared in that module's .bicep file) — this orchestrator only
// re-exposes the handful of values that either have no default (required
// cross-module wiring, like subnet resourceIds and identity principalIds)
// or that genuinely need a single source of truth shared by two modules
// (the deployment storage account name, referenced by both compute.bicep
// and storage-security.bicep — see the SL-61 postmortem in
// .claude/memory.md about what happens when those drift).
//
// Deploy at resource group scope: az deployment group create -g <rg> -f
// main.bicep -p main.dev.bicepparam.

@description('Location for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Name of the VNet (network.bicep). Used here to construct subnet resourceIds for the other modules — the 5 subnet names themselves are fixed, not parametrized, matching network.bicep.')
param vnetName string = 'vnet-predial-dev'

@description('Whether to deploy the Application Gateway + WAF (gateway.bicep, SL-68). It bills a fixed hourly rate regardless of traffic (unlike every other module here) — default true so "one command deploys everything from scratch" holds, but set to false to skip it and redeploy on demand right before a demo. See .claude/review.md (SL-68) for the exact teardown commands.')
param deployGateway bool = true

@description('Shared Storage Account name for the Function App deployment package — passed to both compute.bicep (as a reference) and storage-security.bicep (which creates it), so they can never drift out of sync with each other.')
param deploymentStorageAccountName string = 'stpredialdev'

@description('Shared blob container name for the Function App deployment package — same reasoning as deploymentStorageAccountName.')
param deploymentPackageContainerName string = 'fn-pdf-deploymentpackage'

@description('PostgreSQL administrator login name (data.bicep).')
param postgresAdministratorLogin string = 'pgadmin'

@secure()
@description('PostgreSQL administrator password (data.bicep). No default on purpose — pass via readEnvironmentVariable() in the .bicepparam file, never a literal.')
param postgresAdministratorLoginPassword string

module network 'network.bicep' = {
  name: 'network'
  params: {
    location: location
    vnetName: vnetName
  }
}

var appSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', network.outputs.vnetName, 'snet-app')
var fnSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', network.outputs.vnetName, 'snet-fn')
var dataSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', network.outputs.vnetName, 'snet-data')
var agwSubnetId = resourceId('Microsoft.Network/virtualNetworks/subnets', network.outputs.vnetName, 'snet-agw')

module compute 'compute.bicep' = {
  name: 'compute'
  params: {
    location: location
    appSubnetId: appSubnetId
    fnSubnetId: fnSubnetId
    deploymentStorageAccountName: deploymentStorageAccountName
    deploymentStorageContainerName: deploymentPackageContainerName
  }
}

module storageSecurity 'storage-security.bicep' = {
  name: 'storageSecurity'
  params: {
    location: location
    storageAccountName: deploymentStorageAccountName
    deploymentPackageContainerName: deploymentPackageContainerName
    appServicePrincipalId: compute.outputs.appServicePrincipalId
    functionAppPrincipalId: compute.outputs.functionAppPrincipalId
  }
}

module data 'data.bicep' = {
  name: 'data'
  params: {
    location: location
    administratorLogin: postgresAdministratorLogin
    administratorLoginPassword: postgresAdministratorLoginPassword
    dataSubnetId: dataSubnetId
    vnetId: network.outputs.vnetId
  }
}

module monitor 'monitor.bicep' = {
  name: 'monitor'
  params: {
    location: location
  }
}

module gateway 'gateway.bicep' = if (deployGateway) {
  name: 'gateway'
  params: {
    location: location
    agwSubnetId: agwSubnetId
    backendFqdn: '${compute.outputs.appServiceName}.azurewebsites.net'
  }
}

module staticWebApp 'static-web-app.bicep' = {
  name: 'staticWebApp'
  params: {
    location: location
  }
}

output vnetId string = network.outputs.vnetId
output appServiceHostname string = '${compute.outputs.appServiceName}.azurewebsites.net'
output functionAppName string = compute.outputs.functionAppName
output keyVaultUri string = storageSecurity.outputs.keyVaultId
output postgresServerFqdn string = data.outputs.fullyQualifiedDomainName
output logAnalyticsWorkspaceId string = monitor.outputs.logAnalyticsWorkspaceId
output gatewayPublicIp string = gateway.?outputs.?publicIpAddress ?? ''
output frontendStaticWebsiteEndpoint string = staticWebApp.outputs.staticWebsiteEndpoint
