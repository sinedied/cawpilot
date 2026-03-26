/**
 * Re-exports from shared setup logic.
 * This module exists for backward compatibility — prefer importing from
 * './logic.js' directly in new code.
 */
export {
  type EnvStepStatus,
  getGitHubUser as checkGitHubAuth,
  authenticateGitHub,
  resolveEnvStatus,
  buildChannelsFromEnv,
  listAvailableSkills as listSkillDirs,
} from './steps.js';
