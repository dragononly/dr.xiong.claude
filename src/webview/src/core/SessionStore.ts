import { signal, computed, effect } from 'alien-signals';
import { EventEmitter } from '../utils/events';
import type { ConnectionManager } from './ConnectionManager';
import { Session, type SessionContext, type SessionOptions } from './Session';
import type { PermissionRequest } from './PermissionRequest';
import type { SessionSummary } from './types';

export interface PermissionEvent {
  session: Session;
  permissionRequest: PermissionRequest;
}

export class SessionStore {
  readonly sessions = signal<Session[]>([]);
  readonly activeSession = signal<Session | undefined>(undefined);
  readonly permissionRequested = new EventEmitter<PermissionEvent>();

  readonly sessionsByLastModified = computed(() =>
    [...this.sessions()].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime())
  );

  readonly connectionState = computed(() => this.connectionManager.state());

  private currentConnectionPromise?: Promise<void>;
  private effectCleanups: Array<() => void> = [];

  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly context: SessionContext
  ) {
    this.effectCleanups.push(
      effect(() => {
        if (this.connectionManager.connection()) {
          void this.listSessions();
        }
      })
    );

    this.effectCleanups.push(
      effect(() => {
        const session = this.activeSession();
        const defaultTitle = 'Claude Code';

        if (!session) {
          this.context.renameTab?.(defaultTitle);
          return;
        }

        if (session.isOffline()) {
          session.loadFromServer();
        } else {
          session.preloadConnection();
        }

        const url = new URL(window.location.toString());
        if (session.sessionId()) {
          url.searchParams.set('session', session.sessionId()!);
        } else {
          url.searchParams.delete('session');
        }
        window.history.replaceState({}, '', url.toString());

        const summary = session.summary();
        const title = summary && summary.length > 25 ? `${summary.slice(0, 24)}…` : summary;
        this.context.renameTab?.(title || defaultTitle);
      })
    );

    this.effectCleanups.push(
      effect(() => {
        const sessions = this.sessions();
        const seen = new Map<string, Session>();
        const deduped: Session[] = [];
        let changed = false;

        for (const session of sessions) {
          const id = session.sessionId();
          if (!id) {
            deduped.push(session);
            continue;
          }

          const duplicate = seen.get(id);
          if (duplicate && duplicate !== session) {
            this.mergeSessionMetadata(duplicate, session);
            if (this.activeSession() === session) {
              this.activeSession(duplicate);
            }
            changed = true;
            continue;
          }

          seen.set(id, session);
          deduped.push(session);
        }

        if (changed) {
          this.sessions([...deduped].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime()));
        }
      })
    );
  }

  onPermissionRequested(callback: (event: PermissionEvent) => void): () => void {
    return this.permissionRequested.add(callback);
  }

  async getConnection() {
    return this.connectionManager.get();
  }

  async createSession(options: SessionOptions = {}): Promise<Session> {
    const session = new Session(() => this.getConnection(), this.context, options);

    // 立即设置 cwd，确保新 Session 使用最新的工作目录
    const connection = this.connectionManager.connection();
    if (connection) {
      const defaultCwd = connection.config()?.defaultCwd;
      if (defaultCwd) {
        session.cwd(defaultCwd);
      }
    }

    this.sessions([session, ...this.sessions()]);
    this.activeSession(session);

    this.attachPermissionListener(session);

    return session;
  }

  async listSessions(): Promise<void> {
    if (this.currentConnectionPromise) {
      return this.currentConnectionPromise;
    }

    this.currentConnectionPromise = (async () => {
      try {
        const connection = await this.getConnection();
        const response = await connection.listSessions();

        const existing = new Map(
          this.sessions()
            .filter((session) => !!session.sessionId())
            .map((session) => [session.sessionId() as string, session])
        );

        // 🚀 性能优化：批量收集新 sessions，最后一次性更新
        const newSessions: Session[] = [];

        for (const summary of response.sessions ?? []) {
          if (!summary.isCurrentWorkspace) {
            continue;
          }

          const existingSession = existing.get(summary.id);
          if (existingSession) {
            existingSession.lastModifiedTime(summary.lastModified);
            existingSession.summary(summary.summary);
            existingSession.worktree(summary.worktree);
            existingSession.messageCount(summary.messageCount ?? 0);
            continue;
          }

          const session = Session.fromServer(
            summary as SessionSummary,
            () => this.getConnection(),
            this.context
          );

          this.attachPermissionListener(session);
          newSessions.push(session);
        }

        // 一次性更新 sessions，避免多次触发渲染
        if (newSessions.length > 0) {
          const allSessions = [...this.sessions(), ...newSessions];
          this.sessions(allSessions.sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime()));
        } else {
          // 即使没有新 session，也需要排序（因为现有 session 的时间可能更新了）
          this.sessions(
            [...this.sessions()].sort((a, b) => b.lastModifiedTime() - a.lastModifiedTime())
          );
        }
      } finally {
        this.currentConnectionPromise = undefined;
      }
    })();

    await this.currentConnectionPromise;
  }

  setActiveSession(session: Session | undefined): void {
    this.activeSession(session);
  }

  /**
   * 关闭并移除一个会话
   */
  closeSession(session: Session): void {
    const currentSessions = this.sessions();
    const filtered = currentSessions.filter(s => s !== session);

    // 如果关闭的是当前活跃会话，需要切换
    if (this.activeSession() === session) {
      const idx = currentSessions.indexOf(session);
      const nextSession = filtered[Math.min(idx, filtered.length - 1)];
      this.activeSession(nextSession);
    }

    // 清理会话资源
    session.dispose();

    // 更新会话列表
    this.sessions(filtered);
  }

  dispose(): void {
    // 清理所有 effects
    for (const cleanup of this.effectCleanups) {
      cleanup();
    }
    this.effectCleanups = [];

    // 清理所有 sessions
    for (const session of this.sessions()) {
      session.dispose();
    }
  }

  private attachPermissionListener(session: Session): void {
    session.onPermissionRequested((request) => {
      this.permissionRequested.emit({
        session,
        permissionRequest: request
      });
      if (this.activeSession() !== session) {
        this.activeSession(session);
      }
    });
  }

  private mergeSessionMetadata(target: Session, source: Session): void {
    if (source.summary() && source.summary() !== target.summary()) {
      target.summary(source.summary());
    }

    if (source.lastModifiedTime() > target.lastModifiedTime()) {
      target.lastModifiedTime(source.lastModifiedTime());
    }

    if (!target.worktree() && source.worktree()) {
      target.worktree(source.worktree());
    }
  }
}
