#!/usr/bin/env node
import { Command } from 'commander';
import { runSetup } from './setup.js';
import { loadConfig } from './config.js';

const program = new Command();

program
  .name('cawpilot')
  .description('On-call coding copilot for messaging apps')
  .version('0.1.0');

program
  .command('setup')
  .description('Interactive setup wizard')
  .action(async () => {
    await runSetup();
  });

program
  .command('start')
  .description('Start the CawPilot bot')
  .action(async () => {
    const { main } = await import('../index.js');
  });

program
  .command('config')
  .description('Show current configuration')
  .action(async () => {
    const config = await loadConfig();
    console.log(JSON.stringify(config, null, 2));
  });

program.parse();
