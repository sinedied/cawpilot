import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface SkillMetadata {
  name: string;
  description: string;
}

export interface Skill extends SkillMetadata {
  instructions: string;
}

export async function loadSkills(skillsDir: string, enabledSkills: string[]): Promise<Skill[]> {
  const skills: Skill[] = [];

  for (const name of enabledSkills) {
    const skillPath = join(skillsDir, name, 'skill.md');
    try {
      const content = await readFile(skillPath, 'utf-8');
      const metadata = parseFrontmatter(content);
      skills.push({
        name: metadata.name || name,
        description: metadata.description || '',
        instructions: stripFrontmatter(content),
      });
    } catch {
      console.warn(`Skill "${name}" not found at ${skillPath}`);
    }
  }

  return skills;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const metadata: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const key = line.slice(0, colonIndex).trim();
    const value = line.slice(colonIndex + 1).trim();
    metadata[key] = value;
  }
  return metadata;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
}
