import React, { useState, useEffect, useCallback } from 'react';
import type Database from 'better-sqlite3';
import { Box, Text, useStdout } from 'ink';
import { getTaskCounts } from '../db/tasks.js';
import { getMessageCount } from '../db/messages.js';
import { getAllScheduledTasks } from '../db/scheduled.js';
import {
  registerDashboardCallbacks,
  unregisterDashboardCallbacks,
} from '../cli/dashboard.js';
import { StatusBar } from './status-bar.js';
import { Notification } from './notification.js';
import { Divider } from './divider.js';
import { ChatArea, type ChatMessage } from './chat-area.js';
import { InputLine } from './input-line.js';

const MIN_WIDTH = 48;
const MIN_HEIGHT = 8;
const MAX_CHAT_MESSAGES = 200;

// Fixed lines: status bar (1) + notification (1) + divider (1) + divider (1) + input (1) + border top/bottom (2) = 7
const FIXED_LINES = 7;

type AppProps = {
  db: Database.Database;
  startTime: Date;
  onInput: (text: string) => void;
};

function useTerminalSize() {
  const { stdout } = useStdout();
  const [size, setSize] = useState({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  });

  useEffect(() => {
    const onResize = () => {
      if (stdout) {
        setSize({ columns: stdout.columns, rows: stdout.rows });
      }
    };

    stdout?.on('resize', onResize);
    return () => {
      stdout?.off('resize', onResize);
    };
  }, [stdout]);

  return size;
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function App({ db, startTime, onInput }: AppProps) {
  const { columns, rows } = useTerminalSize();
  const [notification, setNotification] = useState('');
  const [scrollOffset, setScrollOffset] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      sender: 'bot',
      content: 'Ready! Type a message or /help for commands.',
    },
  ]);
  const [stats, setStats] = useState({
    uptime: '0s',
    messageCount: 0,
    active: 0,
    done: 0,
    failed: 0,
    scheduled: 0,
  });

  // Refresh stats from DB periodically
  const refreshStats = useCallback(() => {
    const counts = getTaskCounts(db);
    const messageCount = getMessageCount(db);
    const scheduledTasks = getAllScheduledTasks(db);
    const uptime = formatUptime(Date.now() - startTime.getTime());

    setStats({
      uptime,
      messageCount,
      active: counts['in-progress'],
      done: counts.completed + counts.cancelled,
      failed: counts.failed,
      scheduled: scheduledTasks.length,
    });
  }, [db, startTime]);

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 3000);
    return () => {
      clearInterval(interval);
    };
  }, [refreshStats]);

  // Register direct callbacks for non-React code to push messages/notifications
  useEffect(() => {
    registerDashboardCallbacks(
      (text) => {
        setNotification(text);
      },
      (msg) => {
        setMessages((prev) => {
          const next = [...prev, msg];
          return next.length > MAX_CHAT_MESSAGES
            ? next.slice(-MAX_CHAT_MESSAGES)
            : next;
        });
        setScrollOffset(0);
      },
    );
    return () => {
      unregisterDashboardCallbacks();
    };
  }, []);

  const handleSubmit = (text: string) => {
    // Add user message to chat
    setMessages((prev) => {
      const next = [...prev, { sender: 'user' as const, content: text }];
      return next.length > MAX_CHAT_MESSAGES
        ? next.slice(-MAX_CHAT_MESSAGES)
        : next;
    });
    setScrollOffset(0);
    onInput(text);
  };

  const handleScroll = (delta: number) => {
    // Delta negative = scroll up (increase offset), positive = scroll down (decrease)
    setScrollOffset((prev) => Math.max(0, prev - delta));
  };

  // Terminal too small
  if (columns < MIN_WIDTH || rows < MIN_HEIGHT) {
    return (
      <Box
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        width={columns}
        height={rows}
      >
        <Text color="yellow">
          Terminal too small ({columns}x{rows})
        </Text>
        <Text dimColor>
          Minimum: {MIN_WIDTH}x{MIN_HEIGHT}
        </Text>
      </Box>
    );
  }

  const chatHeight = Math.max(rows - FIXED_LINES, 1);
  const showDividers = chatHeight > 2;
  const chatFinalHeight = showDividers ? chatHeight : chatHeight + 2;
  const compact = columns < 70;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="gray"
      borderDimColor
      width={columns}
      height={rows}
      paddingLeft={1}
      paddingRight={1}
    >
      <StatusBar {...stats} compact={compact} />
      <Notification text={notification} width={columns} />
      {showDividers && <Divider width={columns} />}
      <ChatArea
        messages={messages}
        height={chatFinalHeight}
        width={columns}
        scrollOffset={scrollOffset}
      />
      {showDividers && <Divider width={columns} />}
      <InputLine onSubmit={handleSubmit} onScroll={handleScroll} />
    </Box>
  );
}
