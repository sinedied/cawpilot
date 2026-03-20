#!/usr/bin/env node

import process from 'node:process';
import { resolve } from 'node:path';
import { Command } from 'commander';
import { runSetup } from './cli/setup.js';
import { runStart } from './cli/start.js';
import { runDoctor } from './cli/doctor.js';
import { logger } from './utils/logger.js';

// Ensure CTRL+C always exits cleanly (overridden by start command's own handler)
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Handle @inquirer/prompts ExitPromptError (thrown on SIGINT during prompts)
process.on('uncaughtException', (error) => {
  if (error.name === 'ExitPromptError') {
    process.exit(0);
  }

  throw error;
});

const program = new Command();

program
  .name('cawpilot')
  .description('Autonomous developer assistant powered by GitHub Copilot SDK')
  .version('0.1.0', '-v, --version')
  .option('--debug', 'Enable verbose logging output')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.optsWithGlobals();
    if (opts.debug) {
      logger.enable();
    }
  });

function getWorkspace(): string {
  return resolve(process.env.CAWPILOT_WORKSPACE ?? process.cwd());
}

program
  .command('setup')
  .description('Interactive setup for onboarding: channels, repos, skills')
  .action(async () => {
    await runSetup(getWorkspace());
  });

program
  .command('start')
  .description('Start the CawPilot bot server')
  .action(async () => {
    const debug = program.opts().debug ?? false;
    await runStart(getWorkspace(), { debug });
  });

program
  .command('doctor')
  .description('Run diagnostics to verify configuration and connectivity')
  .action(async () => {
    await runDoctor(getWorkspace());
  });

program.parse();
