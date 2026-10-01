using './gateway.bicep'

param location = 'northcentralus'
param gatewayName = 'agw-predial-dev'
param publicIpName = 'pip-agw-predial-dev'
param wafPolicyName = 'waf-predial-dev'
param agwSubnetId = '/subscriptions/a433cb7c-91a0-4eb6-ac8b-447676229fae/resourceGroups/rg-predial-dev/providers/Microsoft.Network/virtualNetworks/vnet-predial-dev/subnets/snet-agw'
param backendFqdn = 'app-predial-dev.azurewebsites.net'
param capacity = 1
param wafMode = 'Prevention'
param healthProbePath = '/'
