// Observability for a SLOMP environment: a central Log Analytics Workspace
// and one workspace-based Application Insights resource per compute
// resource (backend, PDF Function), both feeding the same workspace so logs
// and metrics from both live side by side for querying/alerting.
//
// This module only creates the observability resources themselves — it
// does not wire app-predial-dev / fn-pdf-predial-dev's app settings to
// actually send telemetry (APPLICATIONINSIGHTS_CONNECTION_STRING). That's
// left to whatever wires the compute resources' app settings (main.bicep,
// SL-66, or app-level config) — this module exposes the connection strings
// as outputs for that to consume.
//
// Deploy at resource group scope (az deployment group create -g <rg> ...).

@description('Location for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Name of the central Log Analytics Workspace.')
param logAnalyticsWorkspaceName string = 'log-predial-dev'

@description('Log Analytics pricing tier.')
param logAnalyticsSku string = 'PerGB2018'

@description('Log retention, in days.')
param logAnalyticsRetentionInDays int = 30

@description('Name of the backend\'s Application Insights resource.')
param backendAppInsightsName string = 'appi-predial-dev'

@description('Name of the PDF Function\'s Application Insights resource.')
param functionAppInsightsName string = 'appi-fn-predial-dev'

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsWorkspaceName
  location: location
  properties: {
    sku: {
      name: logAnalyticsSku
    }
    retentionInDays: logAnalyticsRetentionInDays
  }
}

resource backendAppInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: backendAppInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
  }
}

resource functionAppInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: functionAppInsightsName
  location: location
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalyticsWorkspace.id
    IngestionMode: 'LogAnalytics'
  }
}

output logAnalyticsWorkspaceId string = logAnalyticsWorkspace.id
output backendAppInsightsId string = backendAppInsights.id
output backendAppInsightsConnectionString string = backendAppInsights.properties.ConnectionString
output functionAppInsightsId string = functionAppInsights.id
output functionAppInsightsConnectionString string = functionAppInsights.properties.ConnectionString
