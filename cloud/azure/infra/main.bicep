@minLength(1)
@maxLength(64)
@description('Name of the environment used to generate a unique resource token.')
param environmentName string

@minLength(1)
@description('Primary location for all resources.')
param location string = resourceGroup().location

@description('Container image name for the app service.')
param appImageName string = ''

var tags = {
  'azd-env-name': environmentName
}
var resourceToken = toLower(uniqueString(subscription().subscriptionId, resourceGroup().id, location))

// ---------------------------------------------------------------------------
// User-Assigned Managed Identity (used for ACR pull)
// ---------------------------------------------------------------------------

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-${environmentName}'
  location: location
  tags: tags
}

// ---------------------------------------------------------------------------
// Log Analytics Workspace
// ---------------------------------------------------------------------------

module logAnalytics 'br/public:avm/res/operational-insights/workspace:0.15.0' = {
  name: 'logAnalytics'
  params: {
    name: 'law-${environmentName}'
    location: location
    tags: tags
  }
}

// ---------------------------------------------------------------------------
// Storage Account with Azure Files share (persistent workspace volume)
// ---------------------------------------------------------------------------

module storageAccount 'br/public:avm/res/storage/storage-account:0.32.0' = {
  name: 'storageAccount'
  params: {
    name: 'st${resourceToken}'
    location: location
    tags: tags
    kind: 'StorageV2'
    skuName: 'Standard_LRS'
    fileServices: {
      shares: [
        {
          name: 'workspace'
        }
      ]
    }
  }
}

// ---------------------------------------------------------------------------
// Container Registry
// ---------------------------------------------------------------------------

module acr 'br/public:avm/res/container-registry/registry:0.11.0' = {
  name: 'acr'
  params: {
    name: 'cr${resourceToken}'
    location: location
    tags: tags
    acrSku: 'Basic'
    roleAssignments: [
      {
        principalId: identity.properties.principalId
        roleDefinitionIdOrName: 'AcrPull'
        principalType: 'ServicePrincipal'
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Container Apps Environment (with Azure Files storage mount)
// ---------------------------------------------------------------------------

module containerAppsEnv 'br/public:avm/res/app/managed-environment:0.13.1' = {
  name: 'containerAppsEnv'
  params: {
    name: 'cae-${environmentName}'
    location: location
    tags: tags
    zoneRedundant: false
    publicNetworkAccess: 'Enabled'
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsWorkspaceResourceId: logAnalytics.outputs.resourceId
    }
    storages: [
      {
        name: 'workspace'
        storageAccountName: storageAccount.outputs.name
        accessMode: 'ReadWrite'
        kind: 'SMB'
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Container App
// ---------------------------------------------------------------------------

module containerApp 'br/public:avm/res/app/container-app:0.21.0' = {
  name: 'containerApp'
  params: {
    name: 'ca-${environmentName}'
    location: location
    tags: union(tags, { 'azd-service-name': 'app' })
    environmentResourceId: containerAppsEnv.outputs.resourceId
    managedIdentities: {
      userAssignedResourceIds: [identity.id]
    }
    registries: [
      {
        server: acr.outputs.loginServer
        identity: identity.id
      }
    ]
    ingressTargetPort: 2243
    ingressExternal: true
    ingressAllowInsecure: false
    scaleSettings: {
      minReplicas: 1
      maxReplicas: 1
    }
    containers: [
      {
        name: 'cawpilot'
        image: !empty(appImageName) ? appImageName : 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
        resources: {
          cpu: json('1')
          memory: '2Gi'
        }
        volumeMounts: [
          {
            volumeName: 'workspace-vol'
            mountPath: '/workspace'
          }
        ]
      }
    ]
    volumes: [
      {
        name: 'workspace-vol'
        storageName: 'workspace'
        storageType: 'AzureFile'
      }
    ]
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output AZURE_CONTAINER_REGISTRY_ENDPOINT string = acr.outputs.loginServer
output AZURE_CONTAINER_REGISTRY_NAME string = acr.outputs.name
output SERVICE_APP_NAME string = containerApp.outputs.name
output SERVICE_APP_URI string = 'https://${containerApp.outputs.fqdn}'
