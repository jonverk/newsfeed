export interface ClientConfig {
  baseUrl?: string;
  token?: string;
}

export interface PostInput {
  title: string;
  body: string;
  kind?: "announcement" | "milestone" | "kudos";
  slug?: string;
  author?: string;
  draft?: boolean;
}

export interface RuleInput {
  title: string;
  body: string;
  category: "rules" | "org" | "logging" | "verification" | "process" | "faq" | "other";
  owner?: string;
  rule_id?: string;
  effective_at?: string;
}

export class NewsfeedClient {
  readonly baseUrl: string;
  readonly token?: string;

  constructor(config?: ClientConfig) {
    this.baseUrl = (config?.baseUrl || process.env.NEWSFEED_URL || "https://newsfeed.jonverk.online").replace(/\/+$/, "");
    this.token = config?.token || process.env.NEWSFEED_TOKEN;
  }

  private headers(includeAuth = false): HeadersInit {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (includeAuth) {
      if (!this.token) {
        throw new Error("NEWSFEED_TOKEN is required for write operations");
      }
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async getFeed(): Promise<any> {
    const res = await fetch(`${this.baseUrl}/feed.json`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch feed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async search(query: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/search?q=${encodeURIComponent(query)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Search failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async createPost(input: PostInput): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/posts`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Create post failed (${res.status}): ${errorText}`);
    }
    return res.json();
  }

  async setRule(slug: string, input: RuleInput): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/handbook/${encodeURIComponent(slug)}`, {
      method: "PUT",
      headers: this.headers(true),
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Set rule failed (${res.status}): ${errorText}`);
    }
    return res.json();
  }

  async supersedeRule(slug: string, supersededBy: string): Promise<any> {
    const res = await fetch(`${this.baseUrl}/api/handbook/${encodeURIComponent(slug)}/supersede`, {
      method: "POST",
      headers: this.headers(true),
      body: JSON.stringify({ superseded_by: supersededBy }),
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Supersede rule failed (${res.status}): ${errorText}`);
    }
    return res.json();
  }

  async getOrgChart(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/org.md`);
    if (!res.ok) {
      throw new Error(`Failed to fetch org chart: ${res.status} ${res.statusText}`);
    }
    return res.text();
  }
}
