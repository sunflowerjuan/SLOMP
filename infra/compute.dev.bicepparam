using './compute.bicep'

param location = 'northcentralus'
param appServicePlanName = 'asp-predial-dev'
param appServicePlanSku = 'S1'
param appServiceName = 'app-predial-dev'
param appSubnetId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Network/virtualNetworks/vnet-predial-dev/subnets/snet-app'
param functionPlanName = 'plan-fn-predial-dev'
param functionPlanSkuName = 'FC1'
param functionPlanSkuTier = 'FlexConsumption'
param functionAppName = 'fn-pdf-predial-dev'
param fnSubnetId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Network/virtualNetworks/vnet-predial-dev/subnets/snet-fn'
param functionAppAlwaysReadyInstanceCount = 0
param functionAppMaximumInstanceCount = 100
param functionAppInstanceMemoryMB = 2048
param deploymentStorageAccountName = 'stpredialdev'
param deploymentStorageContainerName = 'fn-pdf-deploymentpackage'
