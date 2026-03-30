targetScope = 'subscription'

@minLength(1)
@maxLength(64)
@description('Name of the environment used to generate a unique resource token.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string

@description('Container image name for the app service.')
param appImageName string = ''

@description('GitHub Personal Access Token for gh CLI auth.')
@secure()
param ghToken string = ''

@description('Telegram bot token.')
@secure()
param telegramToken string = ''

param resourceGroupName string = ''
param cawpilotServiceName string = 'cawpilot'

// Id of the user or app to assign application roles
param principalId string = ''

// Differentiates between automated and manual deployments
param isContinuousIntegration bool // Set in main.parameters.json

// ---------------------------------------------------------------------------
// Common variables

var abbrs = loadJsonContent('abbreviations.json')
var tags = { 'azd-env-name': environmentName }
var resourceToken = toLower(uniqueString(subscription().subscriptionId, environmentName, location))
var setupKey = uniqueString(subscription().subscriptionId, environmentName, 'setup')
var principalType = isContinuousIntegration ? 'ServicePrincipal' : 'User'
var storageAccountName = '${abbrs.storageStorageAccounts}${resourceToken}'
var containerRegistryEndpoint = containerAppsEnvironment!.outputs.registryLoginServer
var cawpilotUrl = 'https://${containerApp.outputs.uri}'

// Returns an array with a name/value object if the value is not empty, otherwise returns an empty array
func pushIfNotEmpty(key string, value string) array => [
  ...!empty(value) ? [{ name: key, value: value }] : []
]

// ---------------------------------------------------------------------------
// Resources

resource resourceGroup 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: !empty(resourceGroupName) ? resourceGroupName : '${abbrs.resourcesResourceGroups}${environmentName}'
  location: location
  tags: tags
}

module monitoring 'br/public:avm/ptn/azd/monitoring:0.2.1' = {
  name: 'monitoring'
  scope: resourceGroup
  params: {
    tags: tags
    location: location
    applicationInsightsName: '${abbrs.insightsComponents}${resourceToken}'
    applicationInsightsDashboardName: '${abbrs.portalDashboards}${resourceToken}'
    logAnalyticsName: '${abbrs.operationalInsightsWorkspaces}${resourceToken}'
  }
}

module storage 'br/public:avm/res/storage/storage-account:0.32.0' = {
  name: 'storage'
  scope: resourceGroup
  params: {
    name: storageAccountName
    tags: tags
    location: location
    skuName: 'Standard_LRS'
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    fileServices: {
      shares: [
        {
          name: 'workspace'
        }
      ]
    }
  }
}

module containerAppIdentity 'br/public:avm/res/managed-identity/user-assigned-identity:0.5.0' = {
  name: '${cawpilotServiceName}-containerapp-identity'
  scope: resourceGroup
  params: {
    name: '${abbrs.managedIdentityUserAssignedIdentities}${cawpilotServiceName}-${resourceToken}'
    location: location
  }
}

module containerAppsEnvironment 'br/public:avm/ptn/azd/container-apps-stack:0.1.1' = {
  name: 'containerapps'
  scope: resourceGroup
  params: {
    containerAppsEnvironmentName: '${abbrs.appManagedEnvironments}${resourceToken}'
    containerRegistryName: '${abbrs.containerRegistryRegistries}${resourceToken}'
    logAnalyticsWorkspaceResourceId: monitoring.outputs.logAnalyticsWorkspaceResourceId
    appInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    acrSku: 'Basic'
    location: location
    acrAdminUserEnabled: true
    zoneRedundant: false
    tags: tags
  }
}

module containerApp 'br/public:avm/ptn/azd/container-app-upsert:0.1.1' = {
  name: '${cawpilotServiceName}-containerapp'
  scope: resourceGroup
  params: {
    name: cawpilotServiceName
    tags: union(tags, { 'azd-service-name': cawpilotServiceName })
    location: location
    env: [
      ...pushIfNotEmpty('GH_TOKEN', ghToken)
      ...pushIfNotEmpty('TELEGRAM_TOKEN', telegramToken)
      {
        name: 'CAWPILOT_WEBSETUP_KEY'
        value: setupKey
      }
    ]
    // secrets: {
    //   secureList: [
    //     ...pushIfNotEmpty('GH_TOKEN', ghToken)
    //     ...pushIfNotEmpty('TELEGRAM_TOKEN', telegramToken)
    //   ]
    // }
    containerAppsEnvironmentName: containerAppsEnvironment!.outputs.environmentName
    containerRegistryName: containerAppsEnvironment!.outputs.registryName
    exists: !empty(appImageName)
    imageName: !empty(appImageName) ? appImageName : 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
    identityType: 'UserAssigned'
    identityName: '${cawpilotServiceName}-containerapp-identity'
    identityPrincipalId: containerAppIdentity.outputs.principalId
    userAssignedIdentityResourceId: containerAppIdentity.outputs.resourceId
    containerCpuCoreCount: '1'
    containerMemory: '2.0'
    targetPort: 2243
    containerMinReplicas: 1
    containerMaxReplicas: 1
    ingressEnabled: true
    external: true
    serviceBinds: [
      {
        name: 'workspace'
        storageName: 'workspace'
        storageType: 'AzureFile'
        mountPath: '/workspace'
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Outputs

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = containerRegistryEndpoint

output CAWPILOT_URL string = cawpilotUrl
output SETUP_URL string = '${cawpilotUrl}/setup/?key=${setupKey}'
