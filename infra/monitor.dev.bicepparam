using './monitor.bicep'

param location = 'northcentralus'
param logAnalyticsWorkspaceName = 'log-predial-dev'
param logAnalyticsSku = 'PerGB2018'
param logAnalyticsRetentionInDays = 30
param backendAppInsightsName = 'appi-predial-dev'
param functionAppInsightsName = 'appi-fn-predial-dev'
