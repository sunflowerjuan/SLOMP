// Public entry point for a SLOMP environment: Application Gateway v2 + WAF
// (OWASP managed ruleset, default config — no custom rate-limit rule yet,
// SL-68 ticket says the default WAF_v2 config is enough for today's demo)
// in front of the backend App Service.
//
// app-predial-dev has httpsOnly: true (compute.bicep, SL-61), so even
// though the public listener here is plain HTTP (no certificate for the
// demo — TLS/custom domain is explicitly out of scope), the Gateway talks
// HTTPS to the backend over its public hostname (App Service has no private
// IP to route to directly; Private Endpoints for App Service are not part
// of this design — arquitectura.md's Private Endpoints are for Key
// Vault/Storage/OpenAI only).
//
// Out of scope (SL-68 ticket):
// - TLS/custom certificate on the public listener, custom domain.
// - Tuned/custom WAF rules (rate limiting etc.) — default OWASP ruleset only.
// - Blocking direct access to app-predial-dev's azurewebsites.net hostname
//   (would need an access-restriction change in compute.bicep, SL-61 —
//   flagged here, not implemented, same as the SL-60 delegation drift).
//
// Deploy at resource group scope (az deployment group create -g <rg> ...).

@description('Location for all resources. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Name of the Application Gateway.')
param gatewayName string = 'agw-predial-dev'

@description('Name of the Gateway\'s public IP address.')
param publicIpName string = 'pip-agw-predial-dev'

@description('Name of the WAF policy.')
param wafPolicyName string = 'waf-predial-dev'

@description('Resource ID of the subnet the Gateway deploys into (snet-agw, from network.bicep). Requires a dedicated, otherwise-empty subnet.')
param agwSubnetId string

@description('Public hostname of the backend App Service (compute.bicep\'s appServiceName + ".azurewebsites.net"). The Gateway reaches it over its public FQDN, not a private IP.')
param backendFqdn string = 'app-predial-dev.azurewebsites.net'

@description('Fixed instance count. WAF_v2 bills per hour regardless of traffic — kept at the minimum for a dev/demo environment.')
param capacity int = 1

@description('WAF mode: Detection logs only, Prevention actively blocks.')
@allowed([
  'Detection'
  'Prevention'
])
param wafMode string = 'Prevention'

@description('Path the health probe requests on the backend.')
param healthProbePath string = '/'

resource publicIp 'Microsoft.Network/publicIPAddresses@2023-11-01' = {
  name: publicIpName
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource wafPolicy 'Microsoft.Network/ApplicationGatewayWebApplicationFirewallPolicies@2023-11-01' = {
  name: wafPolicyName
  location: location
  properties: {
    policySettings: {
      state: 'Enabled'
      mode: wafMode
    }
    managedRules: {
      managedRuleSets: [
        {
          ruleSetType: 'OWASP'
          ruleSetVersion: '3.2'
        }
      ]
    }
  }
}

var gatewayIpConfigName = 'gatewayIpConfig'
var frontendIpConfigName = 'frontendIpConfig'
var frontendPortName = 'port80'
var backendPoolName = 'appServicePool'
var backendHttpSettingsName = 'appServiceHttpSettings'
var probeName = 'appServiceProbe'
var httpListenerName = 'httpListener'
var routingRuleName = 'defaultRoutingRule'

resource applicationGateway 'Microsoft.Network/applicationGateways@2023-11-01' = {
  name: gatewayName
  location: location
  properties: {
    sku: {
      name: 'WAF_v2'
      tier: 'WAF_v2'
      capacity: capacity
    }
    firewallPolicy: {
      id: wafPolicy.id
    }
    gatewayIPConfigurations: [
      {
        name: gatewayIpConfigName
        properties: {
          subnet: {
            id: agwSubnetId
          }
        }
      }
    ]
    frontendIPConfigurations: [
      {
        name: frontendIpConfigName
        properties: {
          publicIPAddress: {
            id: publicIp.id
          }
        }
      }
    ]
    frontendPorts: [
      {
        name: frontendPortName
        properties: {
          port: 80
        }
      }
    ]
    backendAddressPools: [
      {
        name: backendPoolName
        properties: {
          backendAddresses: [
            {
              fqdn: backendFqdn
            }
          ]
        }
      }
    ]
    probes: [
      {
        name: probeName
        properties: {
          protocol: 'Https'
          path: healthProbePath
          interval: 30
          timeout: 30
          unhealthyThreshold: 3
          pickHostNameFromBackendHttpSettings: true
          match: {
            statusCodes: [
              '200-399'
            ]
          }
        }
      }
    ]
    backendHttpSettingsCollection: [
      {
        name: backendHttpSettingsName
        properties: {
          port: 443
          protocol: 'Https'
          cookieBasedAffinity: 'Disabled'
          pickHostNameFromBackendAddress: true
          requestTimeout: 30
          probe: {
            id: resourceId('Microsoft.Network/applicationGateways/probes', gatewayName, probeName)
          }
        }
      }
    ]
    httpListeners: [
      {
        name: httpListenerName
        properties: {
          frontendIPConfiguration: {
            id: resourceId('Microsoft.Network/applicationGateways/frontendIPConfigurations', gatewayName, frontendIpConfigName)
          }
          frontendPort: {
            id: resourceId('Microsoft.Network/applicationGateways/frontendPorts', gatewayName, frontendPortName)
          }
          protocol: 'Http'
        }
      }
    ]
    requestRoutingRules: [
      {
        name: routingRuleName
        properties: {
          ruleType: 'Basic'
          priority: 100
          httpListener: {
            id: resourceId('Microsoft.Network/applicationGateways/httpListeners', gatewayName, httpListenerName)
          }
          backendAddressPool: {
            id: resourceId('Microsoft.Network/applicationGateways/backendAddressPools', gatewayName, backendPoolName)
          }
          backendHttpSettings: {
            id: resourceId('Microsoft.Network/applicationGateways/backendHttpSettingsCollection', gatewayName, backendHttpSettingsName)
          }
        }
      }
    ]
  }
}

output publicIpAddress string = publicIp.properties.ipAddress
output gatewayId string = applicationGateway.id
