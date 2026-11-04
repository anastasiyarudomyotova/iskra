// Executes the production Lua in an isolated in-memory Lua VM. This is a
// deterministic Redis-command simulation, not a test against Upstash itself.
// @ts-expect-error fengari does not publish TypeScript declarations
import { lua, lauxlib, lualib, to_luastring } from "fengari";

export class RedisLuaFixture {
  private L = lauxlib.luaL_newstate();
  requests: string[] = [];
  constructor() {
    lualib.luaL_openlibs(this.L);
    this.execute(`
unpack = table.unpack
now = 1000000
local data, expires = {}, {}
local function get(k)
  if expires[k] and expires[k] <= now then data[k]=nil; expires[k]=nil end
  return data[k]
end
local function sorted(k)
  local a={}; for member, score in pairs(get(k) or {}) do a[#a+1]={member,score} end
  table.sort(a,function(x,y) return x[2] == y[2] and x[1] < y[1] or x[2] < y[2] end)
  return a
end
redis={call=function(cmd,...)
 local a={...}; local k=a[1]; local obj=get(k)
 if cmd=='TIME' then return {math.floor(now/1000), (now%1000)*1000} end
 if cmd=='EXISTS' then return obj and 1 or 0 end
 if cmd=='ZREMRANGEBYSCORE' then for member,score in pairs(obj or {}) do if score <= tonumber(a[3]) then obj[member]=nil end end; return 0 end
 if cmd=='ZCARD' then local n=0; for _ in pairs(obj or {}) do n=n+1 end; return n end
 if cmd=='ZRANGE' then local list=sorted(k); if #list==0 then return {} end; return {list[1][1],tostring(list[1][2])} end
 if cmd=='ZADD' then if not obj then obj={}; data[k]=obj end; obj[a[3]]=tonumber(a[2]); return 1 end
 if cmd=='ZREM' then if obj then obj[a[2]]=nil end; return 1 end
 if cmd=='PEXPIRE' then expires[k]=now+tonumber(a[2]); return 1 end
 if cmd=='HSET' then if not obj then obj={}; data[k]=obj end; for i=2,#a,2 do obj[a[i]]=a[i+1] end; return 1 end
 if cmd=='HGET' then return obj and obj[a[2]] or nil end
 error('unexpected command '..cmd)
end}
`);
  }
  private execute(code: string) {
    const status = lauxlib.luaL_dostring(this.L, to_luastring(code));
    if (status !== lua.LUA_OK) throw new Error(`Lua execution failed: ${lua.lua_tojsstring(this.L, -1)}`);
  }
  advance(ms: number) { this.execute(`now=now+${ms}`); }
  fetch = async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = String(init?.body); this.requests.push(raw);
    const [cmd, script, count, ...rest] = JSON.parse(raw) as [string, string, string, ...string[]];
    if (cmd !== "EVAL") throw new Error("unexpected command");
    const n = Number(count);
    const table = (v: string[]) => `{${v.map(s => JSON.stringify(s)).join(",")}}`;
    this.execute(`KEYS=${table(rest.slice(0,n))}; ARGV=${table(rest.slice(n))}; return (function() ${script} end)()`);
    let result: number | number[];
    if (lua.lua_istable(this.L, -1)) {
      result = [];
      for (let i=1;i<=2;i++) { lua.lua_rawgeti(this.L, -1, i); result.push(lua.lua_tointeger(this.L, -1)); lua.lua_pop(this.L,1); }
    } else result = lua.lua_tointeger(this.L,-1);
    lua.lua_pop(this.L,1);
    return Response.json({result});
  };
}
