#!/usr/bin/env node

import { Command } from 'commander';
import { resolve } from 'node:path';
import { runSetup } from './cli/setup.js';
import { runStart } from './cli/start.js';
import { runDoctor } from './cli/doctor.js';
import { runSend } from './cli/send.js';
import { logger } from './utils/logger.js';

const program = new Command();

program
  .name('cawpilot')
  .description('Autonomous developer assistant powered by GitHub Copilot SDK')
  .version('0.1.0')
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

program
  .command('send <message>')
  .description('Send a message to the bot from the CLI channel')
  .action(async (message: string) => {
    await runSend(getWorkspace(), message);
  });

program.parse();
