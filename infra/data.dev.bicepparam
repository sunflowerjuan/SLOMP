using './data.bicep'

param location = 'northcentralus'
param serverName = 'psql-predial-dev'
param postgresVersion = '16'
param administratorLogin = 'pgadmin'
// Never a literal here. Set the real value as an env var before deploying:
//   PSQL_ADMIN_PASSWORD='...' az deployment group create -g rg-predial-dev --template-file data.bicep --parameters data.dev.bicepparam
// CI (infra-ci.yml) sets it to a placeholder only so `az bicep build-params`
// can resolve this file — that placeholder is what data.dev.json commits,
// never the real password.
param administratorLoginPassword = readEnvironmentVariable('PSQL_ADMIN_PASSWORD')
param skuName = 'Standard_B1ms'
param skuTier = 'Burstable'
param storageSizeGB = 32
param backupRetentionDays = 7
param dataSubnetId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Network/virtualNetworks/vnet-predial-dev/subnets/snet-data'
param vnetId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Network/virtualNetworks/vnet-predial-dev'
