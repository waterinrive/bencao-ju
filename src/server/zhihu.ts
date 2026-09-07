// 知乎开放平台 HTTP 客户端 —— 热榜 + 直答。Bearer + X-Request-Timestamp(秒)。
// Secret 仅后端从 .env 读，不入前端 bundle、不进日志。
const BASE = 'https://developer.zhihu.com';
const SECRET = process.env.ZHIHU_ACCESS_SECRET?.trim() ?? '';

function assertSecret(): string {
  if (!SECRET) throw new Error('ZHIHU_ACCESS_SECRET 未配置（后端 .env 缺失）');
  return SECRET;
}

function tsSeconds(): string {
  return String(Math.floor(Date.now() / 1000));
}

export interface HotItem {
  title: string;
  url: string;
  summary: string;
  thumbnail: string;
}

export interface SearchItem {
  title: string;
  contentText: string;
  url: string;
  authorName: string;
  voteUpCount: number;
}

/** GET /api/v1/content/zhihu_search?Query=...&Count=N → Items[]（知乎站内） */
export async function fetchZhihuSearch(query: string, count = 10): Promise<SearchItem[]> {
  const u = new URL(`${BASE}/api/v1/content/zhihu_search`);
  u.searchParams.set('Query', query);
  u.searchParams.set('Count', String(Math.min(count, 10)));
  const res = await fetch(u, {
    headers: {
      Authorization: `Bearer ${assertSecret()}`,
      'X-Request-Timestamp': tsSeconds(),
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`知乎搜索 ${res.status}: ${await safeText(res)}`);
  const j = (await res.json()) as { Code: number; Data?: { Items?: Array<Record<string, unknown>> } };
  if (j.Code !== 0) throw new Error(`知乎搜索返回 Code=${j.Code}`);
  const items = j.Data?.Items ?? [];
  return items.map(it => ({
    title: String(it.Title ?? ''),
    contentText: String(it.ContentText ?? ''),
    url: String(it.Url ?? ''),
    authorName: String(it.AuthorName ?? ''),
    voteUpCount: Number(it.VoteUpCount ?? 0),
  }));
}

/** GET /api/v1/content/hot_list?Limit=N → Items[] */
export async function fetchHotList(limit = 30): Promise<HotItem[]> {
  const res = await fetch(`${BASE}/api/v1/content/hot_list?Limit=${limit}`, {
    headers: {
      Authorization: `Bearer ${assertSecret()}`,
      'X-Request-Timestamp': tsSeconds(),
    },
  });
  if (!res.ok) throw new Error(`知乎热榜 ${res.status}: ${await safeText(res)}`);
  const j = (await res.json()) as { Code: number; Data?: { Items?: Array<Record<string, unknown>> } };
  if (j.Code !== 0) throw new Error(`知乎热榜返回 Code=${j.Code}`);
  const items = j.Data?.Items ?? [];
  return items.map(it => ({
    title: String(it.Title ?? ''),
    url: String(it.Url ?? ''),
    summary: String(it.Summary ?? ''),
    thumbnail: String(it.ThumbnailUrl ?? ''),
  }));
}

/** POST /v1/chat/completions（OpenAI 兼容）→ 文本 */
export async function chatCompletion(
  model: string,
  messages: Array<{ role: string; content: string }>,
): Promise<string> {
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${assertSecret()}`,
      'X-Request-Timestamp': tsSeconds(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  });
  if (!res.ok) throw new Error(`知乎直答 ${res.status}: ${await safeText(res)}`);
  const j = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = j.choices?.[0]?.message?.content;
  if (!text || !text.trim()) throw new Error('知乎直答返回空');
  return text;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '<no body>';
  }
}
