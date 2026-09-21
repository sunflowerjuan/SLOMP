using './compute.bicep'

// .bicepparam does not support ARM functions like subscriptionResourceId(), so
// the subnet IDs below are literal resource IDs. Fetched from the team's real
// Azure for Students subscription (rg-predial-dev, deployed by SL-60) with:
//   az network vnet subnet show -g rg-predial-dev --vnet-name vnet-predial-dev \
//     -n snet-app --query id -o tsv
// (same command with -n snet-fn for the other one)
param location = 'northcentralus'
param appSubnetId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Network/virtualNetworks/vnet-predial-dev/subnets/snet-app'
param fnSubnetId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Network/virtualNetworks/vnet-predial-dev/subnets/snet-fn'
param appServicePlanName = 'asp-predial-dev'
param appServicePlanSkuName = 'S1'
param appServicePlanSkuTier = 'Standard'
param appServiceName = 'app-predial-dev'
param functionPlanName = 'plan-fn-predial-dev'
param functionAppName = 'fn-pdf-predial-dev'
param functionAppAlwaysReadyInstanceCount = 0
param deploymentStorageAccountName = 'stpredialdev'
param deploymentStorageContainerName = 'fn-pdf-deploymentpackage'
