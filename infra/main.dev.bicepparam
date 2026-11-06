using './main.bicep'

param location = 'northcentralus'
param vnetName = 'vnet-predial-dev'
param deployGateway = true
param deploymentStorageAccountName = 'stpredialdev'
param deploymentPackageContainerName = 'fn-pdf-deploymentpackage'
param postgresAdministratorLogin = 'pgadmin'
// Never a literal here. Set the real value as an env var before deploying:
//   PSQL_ADMIN_PASSWORD='...' az deployment group create -g rg-predial-dev --template-file main.bicep --parameters main.dev.bicepparam
// CI (infra-ci.yml) sets it to a placeholder only so `az bicep build-params`
// can resolve this file — that placeholder is what main.dev.json commits,
// never the real password. Same convention as data.dev.bicepparam.
param postgresAdministratorLoginPassword = readEnvironmentVariable('PSQL_ADMIN_PASSWORD')
