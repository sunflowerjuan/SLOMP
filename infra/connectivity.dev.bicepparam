using './connectivity.bicep'

param location = 'northcentralus'
param vnetId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Network/virtualNetworks/vnet-predial-dev'
param peSubnetId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Network/virtualNetworks/vnet-predial-dev/subnets/snet-pe'
param keyVaultId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.KeyVault/vaults/kv-predial-dev'
param storageAccountId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Storage/storageAccounts/stpredialdev'
