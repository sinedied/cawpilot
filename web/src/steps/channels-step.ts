import { LitElement, html, css } from 'lit';
import { customElement, state, property } from 'lit/decorators.js';
import { sharedStyles } from '../lib/styles.js';

@customElement('channels-step')
export class ChannelsStep extends LitElement {
  static override styles = [
    sharedStyles,
    css`
      .channel-card {
        background: #161b22;
        border: 1px solid #30363d;
        border-radius: 8px;
        padding: 1rem;
        margin-bottom: 1rem;
      }
      .channel-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        font-weight: 600;
      }
      .channel-toggle {
        margin-left: auto;
      }
    `,
  ];

  @property({ type: String }) telegramToken = '';

  @state() telegramEnabled = true;
  @state() _telegramToken = '';
  @state() httpEnabled = true;

  override connectedCallback() {
    super.connectedCallback();
    this._telegramToken = this.telegramToken;
  }

  get channels() {
    const channels: Array<{
      type: string;
      enabled: boolean;
      telegramToken?: string;
      allowList?: string[];
      httpPort?: number;
    }> = [];

    if (this.telegramEnabled && this._telegramToken.trim()) {
      channels.push({
        type: 'telegram',
        enabled: true,
        telegramToken: this._telegramToken.trim(),
        allowList: [],
      });
    }

    if (this.httpEnabled) {
      channels.push({
        type: 'http',
        enabled: true,
        httpPort: 3000,
      });
    }

    return channels;
  }

  override render() {
    return html`
      <div class="step-header">Channels</div>
      <div class="step-desc">
        Configure how you'll communicate with your agent.
      </div>

      <div class="channel-card">
        <div class="channel-header">
          📱 Telegram
          <label class="channel-toggle">
            <input
              type="checkbox"
              .checked=${this.telegramEnabled}
              @change=${(e: Event) => {
                this.telegramEnabled = (e.target as HTMLInputElement).checked;
              }}
            />
          </label>
        </div>
        ${this.telegramEnabled
          ? html`
              <div class="field">
                <label>Bot Token (from BotFather)</label>
                <input
                  type="password"
                  placeholder="123456:ABC-DEF..."
                  .value=${this._telegramToken}
                  @input=${(e: Event) => {
                    this._telegramToken = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>
              <div style="font-size:0.8rem;color:#8b949e">
                Use /pair after starting to link your Telegram account.
              </div>
            `
          : ''}
      </div>

      <div class="channel-card">
        <div class="channel-header">
          🌐 HTTP API
          <label class="channel-toggle">
            <input
              type="checkbox"
              .checked=${this.httpEnabled}
              @change=${(e: Event) => {
                this.httpEnabled = (e.target as HTMLInputElement).checked;
              }}
            />
          </label>
        </div>
        <div style="font-size:0.8rem;color:#8b949e">
          API key will be auto-generated. Port: 3000.
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'channels-step': ChannelsStep;
  }
}
