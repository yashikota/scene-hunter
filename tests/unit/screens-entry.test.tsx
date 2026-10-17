// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { m } from '../../src/client/paraglide/messages';
import { setLocale } from '../../src/client/paraglide/runtime';
import { Connecting } from '../../src/client/screens/Connecting';
import { LobbyGm } from '../../src/client/screens/LobbyGm';
import { LobbyPlayer } from '../../src/client/screens/LobbyPlayer';
import { parseCodeParam } from '../../src/client/routes/index';
import { Top } from '../../src/client/screens/Top';
import { LOCALE_NAMES, LOCALES } from '../../src/shared/locales';

const setLanguages = (langs: string[]) =>
  Object.defineProperty(window.navigator, 'languages', { value: langs, configurable: true });

const players = [
  { pid: 'a', label: 'はるか' },
  { pid: 'b', label: 'はるか (2)' },
  { pid: 'c', label: 'そうた' },
];

const lobbyGm = (over: Partial<Parameters<typeof LobbyGm>[0]> = {}) => (
  <LobbyGm
    code="482913"
    gmName="ゆうき"
    players={players}
    rounds={3}
    limitSec={60}
    onStart={() => {}}
    onTransfer={async () => {}}
    onDissolve={() => {}}
    {...over}
  />
);

beforeEach(() => {
  setLanguages(['ja-JP']);
  setLocale('ja', { reload: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Top', () => {
  it('WebTransport が無いブラウザでは非対応の画面を出す', () => {
    expect(typeof (globalThis as { WebTransport?: unknown }).WebTransport).toBe('undefined');
    render(<Top onEntered={() => {}} />);
    expect(screen.getByRole('heading', { name: m.unsupported_title() })).toBeTruthy();
    expect(screen.queryByRole('button', { name: m.join_button() })).toBeNull();
  });

  describe('WebTransport があるとき', () => {
    beforeEach(() => vi.stubGlobal('WebTransport', class {}));

    it('言語のプルダウンに 11 言語が LOCALE_NAMES の表記で並び、ブラウザの言語が選ばれている', () => {
      setLanguages(['ko-KR', 'en']);
      render(<Top onEntered={() => {}} />);
      const select = screen.getByRole('combobox') as unknown as HTMLSelectElement;
      expect([...select.options].map((o) => o.textContent)).toEqual(LOCALES.map((l) => LOCALE_NAMES[l]));
      expect([...select.options].map((o) => o.value)).toEqual([...LOCALES]);
      expect(select.value).toBe('ko');
      // 画面の文言もその言語になる
      expect(screen.getByRole('button', { name: '방에 들어가기' })).toBeTruthy();
    });

    it('選んだ言語で部屋を作る', async () => {
      const create = vi.fn(async () => '482913');
      const onEntered = vi.fn();
      render(<Top onEntered={onEntered} deps={{ create, join: vi.fn() }} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fr' } });
      fireEvent.change(screen.getByLabelText(m.name_label()), { target: { value: ' はるか ' } });
      fireEvent.click(screen.getByRole('button', { name: m.create_button() }));
      await vi.waitFor(() => expect(onEntered).toHaveBeenCalledWith('482913'));
      expect(create).toHaveBeenCalledWith('はるか', 'fr');
    });

    it('部屋がまだ見えない間（onWaiting）は「部屋を準備しています」を出す', async () => {
      const join = vi.fn((_code: string, _name: string, opts: { onWaiting?: () => void }) => {
        opts.onWaiting?.();
        return new Promise<never>(() => {});
      });
      render(<Top onEntered={() => {}} deps={{ create: vi.fn(), join }} />);
      fireEvent.change(screen.getByLabelText(m.code_label()), { target: { value: '482913' } });
      fireEvent.change(screen.getByLabelText(m.name_label()), { target: { value: 'はるか' } });
      fireEvent.click(screen.getByRole('button', { name: m.join_button() }));
      expect(await screen.findByText('部屋を準備しています')).toBeTruthy();
      expect(join).toHaveBeenCalledWith('482913', 'はるか', expect.anything());
    });

    it('6 桁でない番号では入ろうとしない', () => {
      const join = vi.fn();
      render(<Top onEntered={() => {}} deps={{ create: vi.fn(), join }} />);
      fireEvent.change(screen.getByLabelText(m.code_label()), { target: { value: '4829' } });
      fireEvent.change(screen.getByLabelText(m.name_label()), { target: { value: 'はるか' } });
      fireEvent.click(screen.getByRole('button', { name: m.join_button() }));
      expect(screen.getByRole('alert').textContent).toBe(m.error_code());
      expect(join).not.toHaveBeenCalled();
    });
  });
});

describe('?code= で開く', () => {
  beforeEach(() => vi.stubGlobal('WebTransport', class {}));

  it('Top は initialCode を番号の入力に入れ、名前に合わせる', () => {
    render(<Top initialCode="123456" onEntered={() => {}} />);
    expect((screen.getByLabelText(m.code_label()) as HTMLInputElement).value).toBe('123456');
    expect(document.activeElement).toBe(screen.getByLabelText(m.name_label()));
  });

  it('番号が無いときは空のままで、名前に合わせない', () => {
    render(<Top onEntered={() => {}} />);
    expect((screen.getByLabelText(m.code_label()) as HTMLInputElement).value).toBe('');
    expect(document.activeElement).not.toBe(screen.getByLabelText(m.name_label()));
  });

  it('6 桁の数字以外の code は無視する', () => {
    expect(parseCodeParam('123456')).toBe('123456');
    expect(parseCodeParam('000123')).toBe('000123');
    for (const bad of ['12345', '1234567', 'abcdef', '12345a', '', ' 123456', undefined, null, ['123456'], {}]) {
      expect(parseCodeParam(bad)).toBeUndefined();
    }
  });
});

describe('Connecting', () => {
  it('部屋を準備中なら「部屋を準備しています」', () => {
    render(<Connecting preparing />);
    expect(screen.getByRole('heading', { name: '部屋を準備しています' })).toBeTruthy();
  });
});

describe('LobbyGm', () => {
  it('GM の印、参加者の label、3 ラウンドと 60 秒の固定表示があり、設定を変える操作は無い', () => {
    render(lobbyGm());
    expect(screen.getByText(m.you_are_gm())).toBeTruthy();
    expect(screen.getByText('ゆうき（GM）')).toBeTruthy();
    for (const p of players) expect(screen.getByText(p.label)).toBeTruthy();
    expect(screen.getByText('4 人')).toBeTruthy(); // GM を含める
    expect(screen.getByText(m.rounds_label()).parentElement?.textContent).toContain('3');
    expect(screen.getByText(m.limit_label()).parentElement?.textContent).toContain('60');
    // ボタンは開始、交代、解散だけで、ラウンド数と制限時間を変える入力も無い
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      m.copy_link(),
      m.start_button(),
      m.transfer_button(),
      m.dissolve_button(),
    ]);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('参加者がいなければ開始できない', () => {
    render(lobbyGm({ players: [] }));
    expect((screen.getByRole('button', { name: m.start_button() }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('GM の交代は参加者を選んで渡す', async () => {
    const onTransfer = vi.fn(async () => {});
    render(lobbyGm({ onTransfer }));
    fireEvent.click(screen.getByRole('button', { name: m.transfer_button() }));
    const dialog = screen.getByRole('dialog', { name: m.transfer_title() });
    fireEvent.click(within(dialog).getByRole('button', { name: 'そうた' }));
    await vi.waitFor(() => expect(onTransfer).toHaveBeenCalledWith('c'));
  });

  it("setLocale('en') で描くと英語の文言になる", () => {
    setLocale('en', { reload: false });
    render(lobbyGm());
    expect(screen.getByText('You are the GM')).toBeTruthy();
    expect(screen.getByText('4 players')).toBeTruthy();
    expect(screen.getByText('60 sec')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start the game' })).toBeTruthy();
  });
});

describe('LobbyGm のリンクのコピー', () => {
  it('?code= の URL を clipboard に書く', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...window.navigator, clipboard: { writeText } });
    render(lobbyGm());
    fireEvent.click(screen.getByRole('button', { name: m.copy_link() }));
    expect(writeText).toHaveBeenCalledWith(`${location.origin}/?code=482913`);
    expect(await screen.findByRole('button', { name: m.link_copied() })).toBeTruthy();
  });

  it('書けなかったら、リンクを入れた読み取り専用の入力を出す', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { ...window.navigator, clipboard: { writeText } });
    render(lobbyGm());
    fireEvent.click(screen.getByRole('button', { name: m.copy_link() }));
    const input = (await screen.findByRole('textbox')) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe(`${location.origin}/?code=482913`);
  });
});

describe('LobbyPlayer', () => {
  it('自分と GM に印を付け、固定の設定を出し、部屋を出られる', () => {
    const onLeave = vi.fn();
    render(
      <LobbyPlayer
        code="482913"
        me={{ pid: 'a', label: 'はるか' }}
        gmName="ゆうき"
        players={players}
        rounds={3}
        limitSec={60}
        onLeave={onLeave}
      />,
    );
    expect(screen.getByText('はるか として参加中')).toBeTruthy();
    expect(screen.getByText('はるか（あなた）')).toBeTruthy();
    expect(screen.getByText('ゆうき（GM）')).toBeTruthy();
    expect(screen.getByText('3 ラウンド')).toBeTruthy();
    expect(screen.getByText('制限時間 60 秒')).toBeTruthy();
    expect(screen.getByText('部屋 482 913')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: m.leave_button() }));
    expect(onLeave).toHaveBeenCalled();
  });
});
