import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../lib/styles.js';
import { api } from '../lib/api.js';

@customElement('skills-step')
export class SkillsStep extends LitElement {
  static override styles = [sharedStyles];

  @state() available: string[] = [];
  @state() selected = new Set<string>();
  @state() loading = true;

  override connectedCallback() {
    super.connectedCallback();
    void this.loadSkills();
  }

  private async loadSkills() {
    try {
      const result = await api<{ skills: string[] }>('/skills');
      this.available = result.skills;
      // All enabled by default
      this.selected = new Set(result.skills);
    } catch {
      // Non-critical
    }

    this.loading = false;
  }

  get skills(): string[] {
    return [...this.selected];
  }

  private toggle(skill: string) {
    const next = new Set(this.selected);
    if (next.has(skill)) {
      next.delete(skill);
    } else {
      next.add(skill);
    }

    this.selected = next;
  }

  override render() {
    if (this.loading) {
      return html`
        <div class="step-header">Skills</div>
        <div class="step-desc">
          <span class="spinner"></span> Loading skills...
        </div>
      `;
    }

    return html`
      <div class="step-header">Skills</div>
      <div class="step-desc">
        Skills give your agent specialized abilities. Select which ones to
        enable.
      </div>

      ${this.available.length === 0
        ? html`<div style="color:var(--cp-text-secondary)">
            No skills available.
          </div>`
        : html`
            <div class="checkbox-list">
              ${this.available.map(
                (skill) => html`
                  <label>
                    <input
                      type="checkbox"
                      .checked=${this.selected.has(skill)}
                      @change=${() => this.toggle(skill)}
                    />
                    ${skill}
                  </label>
                `,
              )}
            </div>
          `}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'skills-step': SkillsStep;
  }
}
