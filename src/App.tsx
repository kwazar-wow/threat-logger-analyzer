import React, { useState, useMemo, useEffect } from 'react';
import { Upload, Activity, Table as TableIcon, Users, AlertCircle, ZoomOut, CheckSquare, Square } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceArea } from 'recharts';

function parseLua(code: string) {
  let pos = 0;

  function skipWhitespace() {
    while (pos < code.length) {
      if (/\s/.test(code[pos])) {
        pos++;
      } else if (code.startsWith('--', pos)) {
        while (pos < code.length && code[pos] !== '\n') pos++;
      } else {
        break;
      }
    }
  }

  function parseValue(): any {
    skipWhitespace();
    if (code[pos] === '{') return parseTable();
    if (code[pos] === '"') return parseString();
    if (/[0-9\.-]/.test(code[pos])) return parseNumber();
    if (code.startsWith('true', pos)) { pos += 4; return true; }
    if (code.startsWith('false', pos)) { pos += 5; return false; }
    if (code.startsWith('nil', pos)) { pos += 3; return null; }
    throw new Error(`Unexpected token at ${pos}: ${code.slice(pos, pos + 10)}`);
  }

  function parseString() {
    pos++; // skip "
    const start = pos;
    while (pos < code.length) {
      if (code[pos] === '\\') {
        pos += 2;
      } else if (code[pos] === '"') {
        break;
      } else {
        pos++;
      }
    }
    const str = code.slice(start, pos).replace(/\\"/g, '"');
    pos++; // skip "
    return str;
  }

  function parseNumber() {
    const start = pos;
    while (pos < code.length && /[0-9\.-]/.test(code[pos])) pos++;
    return parseFloat(code.slice(start, pos));
  }

  function parseTable() {
    pos++; // skip {
    skipWhitespace();
    let isArray = true;
    const arr: any[] = [];
    const obj: any = {};

    while (pos < code.length && code[pos] !== '}') {
      skipWhitespace();
      if (code[pos] === '}') break;

      if (code[pos] === '[') {
        isArray = false;
        pos++; // skip [
        const key = parseValue();
        pos++; // skip ]
        skipWhitespace();
        if (code[pos] === '=') {
          pos++; // skip =
          const val = parseValue();
          obj[key] = val;
        }
      } else if (/[a-zA-Z_]/.test(code[pos])) {
        const start = pos;
        while (pos < code.length && /[a-zA-Z0-9_]/.test(code[pos])) pos++;
        const key = code.slice(start, pos);
        const tempPos = pos;
        skipWhitespace();
        if (code[pos] === '=') {
          isArray = false;
          pos++; // skip =
          const val = parseValue();
          obj[key] = val;
        } else {
          pos = start; // backtrack
          const val = parseValue();
          arr.push(val);
        }
      } else {
        const val = parseValue();
        arr.push(val);
      }

      skipWhitespace();
      if (code[pos] === ',') pos++;
    }
    pos++; // skip }
    return isArray ? arr : obj;
  }

  const result: any = {};
  while (pos < code.length) {
    skipWhitespace();
    if (pos >= code.length) break;
    const start = pos;
    while (pos < code.length && /[a-zA-Z0-9_]/.test(code[pos])) pos++;
    const key = code.slice(start, pos);
    if (!key) {
      pos++;
      continue;
    }
    skipWhitespace();
    if (code[pos] === '=') {
      pos++;
      result[key] = parseValue();
    }
  }
  return result;
}

function processData(db: any[]) {
  const enemies: Record<string, any> = {};
  const playerClasses: Record<string, string> = {};

  db.forEach(snapshot => {
    const timeStr = snapshot.timestamp;
    const timeParts = timeStr.split(':');
    const timeInSeconds = parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseInt(timeParts[2]);

    if (snapshot.enemies) {
      snapshot.enemies.forEach((enemy: any) => {
        const guid = enemy.mobGUID;
        if (!enemies[guid]) {
          enemies[guid] = {
            mobGUID: guid,
            mobName: enemy.mobName,
            pullTime: timeStr,
            pullTimeInSeconds: timeInSeconds,
            snapshots: [],
            players: new Set(),
          };
        }

        const playersInSnapshot: Record<string, number> = {};
        if (enemy.threatTable) {
          enemy.threatTable.forEach((entry: any) => {
            playersInSnapshot[entry.name] = entry.threat / 100;
            enemies[guid].players.add(entry.name);
            if (entry.class) {
              playerClasses[entry.name] = entry.class;
            }
          });
        }

        const relativeTime = timeInSeconds - enemies[guid].pullTimeInSeconds;
        const mins = Math.floor(relativeTime / 60);
        const secs = relativeTime % 60;
        const relativeTimeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

        enemies[guid].snapshots.push({
          timestamp: timeStr,
          timeInSeconds: timeInSeconds,
          relativeTime: relativeTime,
          relativeTimeStr: relativeTimeStr,
          ...playersInSnapshot
        });
      });
    }
  });

  return { enemies, playerClasses };
}

const COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const WOW_CLASS_COLORS: Record<string, string> = {
  WARRIOR: '#C79C6E',
  PALADIN: '#F58CBA',
  HUNTER: '#ABD473',
  ROGUE: '#FFF569',
  PRIEST: '#FFFFFF',
  DEATHKNIGHT: '#C41F3B',
  SHAMAN: '#0070DE',
  MAGE: '#69CCF0',
  WARLOCK: '#9482C9',
  DRUID: '#FF7D0A',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const sortedPayload = [...payload].sort((a, b) => b.value - a.value).slice(0, 5);

    return (
      <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-lg shadow-xl">
        <p className="text-zinc-400 text-sm mb-2 font-medium">{label}</p>
        <div className="space-y-1">
          {sortedPayload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center justify-between space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                <span className="font-medium text-zinc-200">{entry.name}</span>
              </div>
              <span className="text-zinc-300 font-mono">
                {entry.value >= 1000 ? `${(entry.value / 1000).toFixed(1)}k` : entry.value.toFixed(1)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export default function App() {
  const [data, setData] = useState<any>(null);
  const [playerClasses, setPlayerClasses] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [selectedEnemy, setSelectedEnemy] = useState<string | null>(null);
  const [hiddenPlayers, setHiddenPlayers] = useState<Set<string>>(new Set());
  const [refAreaLeft, setRefAreaLeft] = useState<string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<{start: string, end: string} | null>(null);

  useEffect(() => {
    setHiddenPlayers(new Set());
    setTimeRange(null);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  }, [selectedEnemy]);

  const handleSelectAll = () => {
    setHiddenPlayers(new Set());
  };

  const handleDeselectAll = () => {
    if (enemyData) {
      setHiddenPlayers(new Set(enemyData.players));
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const parsed = parseLua(text);
        if (!parsed.ThreatLoggerDB) {
          throw new Error("ThreatLoggerDB not found in file.");
        }
        const processed = processData(parsed.ThreatLoggerDB);
        setData(processed.enemies);
        setPlayerClasses(processed.playerClasses);
        setError(null);
        
        const enemiesList = Object.keys(processed.enemies);
        if (enemiesList.length > 0) {
          setSelectedEnemy(enemiesList[0]);
        }
      } catch (err: any) {
        console.error(err);
        setError("Failed to parse file. Please ensure it's a valid ThreatLogger Lua file.");
      }
    };
    reader.readAsText(file);
  };

  const enemyData = useMemo(() => {
    if (!data || !selectedEnemy) return null;
    return data[selectedEnemy];
  }, [data, selectedEnemy]);

  const filteredSnapshots = useMemo(() => {
    if (!enemyData) return [];
    let snaps = enemyData.snapshots;
    if (timeRange) {
      const idx1 = snaps.findIndex((s: any) => s.relativeTimeStr === timeRange.start);
      const idx2 = snaps.findIndex((s: any) => s.relativeTimeStr === timeRange.end);
      if (idx1 !== -1 && idx2 !== -1) {
        snaps = snaps.slice(idx1, idx2 + 1);
      }
    }
    return snaps;
  }, [enemyData, timeRange]);

  const sampledSnapshots = useMemo(() => {
    const snapshots = filteredSnapshots;
    const MAX_POINTS = 300;
    if (snapshots.length <= MAX_POINTS) return snapshots;
    
    const step = Math.ceil(snapshots.length / MAX_POINTS);
    return snapshots.filter((_: any, i: number) => i % step === 0 || i === snapshots.length - 1);
  }, [filteredSnapshots]);

  const tableData = useMemo(() => {
    if (!enemyData) return [];
    
    const players = Array.from(enemyData.players) as string[];
    const snapshots = filteredSnapshots;
    
    if (snapshots.length === 0) return [];
    
    return players
      .filter(player => !hiddenPlayers.has(player))
      .map(player => {
      let firstTime: number | null = null;
      let lastTime: number | null = null;
      let minThreat = Infinity;
      let maxThreat = -Infinity;
      
      snapshots.forEach((s: any) => {
        if (s[player] !== undefined) {
          if (firstTime === null) firstTime = s.timeInSeconds;
          lastTime = s.timeInSeconds;
          minThreat = Math.min(minThreat, s[player]);
          maxThreat = Math.max(maxThreat, s[player]);
        }
      });
      
      if (minThreat === Infinity) minThreat = 0;
      if (maxThreat === -Infinity) maxThreat = 0;
      
      const timeDiff = Math.max(1, (lastTime || 0) - (firstTime || 0));
      const tps = (maxThreat - minThreat) / timeDiff;
      
      return {
        name: player,
        maxThreat,
        tps: tps.toFixed(1)
      };
    }).sort((a, b) => b.maxThreat - a.maxThreat);
  }, [enemyData, hiddenPlayers]);

  const handleLegendClick = (e: any) => {
    const playerName = e.dataKey;
    setHiddenPlayers(prev => {
      const next = new Set(prev);
      if (next.has(playerName)) {
        next.delete(playerName);
      } else {
        next.add(playerName);
      }
      return next;
    });
  };

  const handleMouseDown = (e: any) => {
    if (e && e.activeLabel) setRefAreaLeft(e.activeLabel);
  };

  const handleMouseMove = (e: any) => {
    if (refAreaLeft && e && e.activeLabel) setRefAreaRight(e.activeLabel);
  };

  const handleMouseUp = () => {
    if (!refAreaLeft || !refAreaRight || refAreaLeft === refAreaRight) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }
    
    if (enemyData) {
      const snaps = enemyData.snapshots;
      let idx1 = snaps.findIndex((s: any) => s.relativeTimeStr === refAreaLeft);
      let idx2 = snaps.findIndex((s: any) => s.relativeTimeStr === refAreaRight);
      
      if (idx1 !== -1 && idx2 !== -1) {
        if (idx1 > idx2) {
          const temp = idx1;
          idx1 = idx2;
          idx2 = temp;
        }
        setTimeRange({ start: snaps[idx1].relativeTimeStr, end: snaps[idx2].relativeTimeStr });
      }
    }
    
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 font-sans">
      <div className="w-full mx-auto space-y-6">
        <header className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div className="flex items-center space-x-3">
            <Activity className="w-8 h-8 text-emerald-500" />
            <h1 className="text-2xl font-bold tracking-tight">Threat Visualizer</h1>
            <h2>Load fire from: WoW_DIRECTORY\_anniversary_\WTF\Account\YOUR_MAIN_ACCOUNT_ID\SavedVariables\ThreatLogger.lua</h2>
          </div>
          
          <div>
            <label className="flex items-center space-x-2 bg-zinc-800 hover:bg-zinc-700 transition-colors px-4 py-2 rounded-lg cursor-pointer border border-zinc-700">
              <Upload className="w-4 h-4" />
              <span className="text-sm font-medium">Load .lua File</span>
              <input type="file" accept=".lua,.txt" className="hidden" onChange={handleFileUpload} />
            </label>
          </div>
        </header>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-lg flex items-center space-x-3">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        )}
        
        {!data && !error && (
          <div className="flex flex-col items-center justify-center py-24 text-zinc-500 border-2 border-dashed border-zinc-800 rounded-2xl">
            <Upload className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No data loaded</p>
            <p className="text-sm">Upload a ThreatLoggerDB .lua file to begin</p>
          </div>
        )}

        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar */}
            <div className="space-y-4">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  Select Enemy
                </h2>
                <div className="space-y-1 max-h-[700px] overflow-y-auto pr-2">
                  {Object.values(data).map((enemy: any) => (
                    <button
                      key={enemy.mobGUID}
                      onClick={() => setSelectedEnemy(enemy.mobGUID)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedEnemy === enemy.mobGUID 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'text-zinc-300 hover:bg-zinc-800 border border-transparent'
                      }`}
                    >
                      <div className="font-medium truncate">{enemy.mobName}</div>
                      <div className="text-xs text-zinc-400 truncate mt-0.5">Pull: {enemy.pullTime}</div>
                      <div className="text-xs opacity-50 truncate mt-0.5">ID: {enemy.mobGUID.split('-').pop()}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Main Content */}
            <div className="lg:col-span-3 space-y-6">
              {enemyData ? (
                <>
                  {/* Graph */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <h2 className="text-lg font-medium flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-emerald-500" />
                        Threat over Time: <span className="text-zinc-400 ml-2">{enemyData.mobName}</span>
                        <span className="text-zinc-500 text-sm ml-2 font-normal">(Pull: {enemyData.pullTime})</span>
                      </h2>
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={handleSelectAll}
                          className="flex items-center px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700"
                        >
                          <CheckSquare className="w-4 h-4 mr-2" />
                          Select All
                        </button>
                        <button 
                          onClick={handleDeselectAll}
                          className="flex items-center px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700"
                        >
                          <Square className="w-4 h-4 mr-2" />
                          Deselect All
                        </button>
                        {timeRange && (
                          <button 
                            onClick={() => setTimeRange(null)}
                            className="flex items-center px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors border border-zinc-700"
                          >
                            <ZoomOut className="w-4 h-4 mr-2" />
                            Reset Zoom
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="h-[600px] w-full select-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart 
                          data={sampledSnapshots} 
                          margin={{ top: 5, right: 20, bottom: 5, left: 0 }}
                          onMouseDown={handleMouseDown}
                          onMouseMove={handleMouseMove}
                          onMouseUp={handleMouseUp}
                          onMouseLeave={handleMouseUp}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                          <XAxis 
                            dataKey="relativeTimeStr" 
                            stroke="#52525b" 
                            tick={{ fill: '#a1a1aa', fontSize: 12 }} 
                            tickMargin={10}
                          />
                          <YAxis 
                            stroke="#52525b" 
                            tick={{ fill: '#a1a1aa', fontSize: 12 }}
                            tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value}
                          />
                          <Tooltip 
                            content={<CustomTooltip />}
                            isAnimationActive={false}
                          />
                          <Legend 
                            wrapperStyle={{ paddingTop: '20px', cursor: 'pointer' }} 
                            onClick={handleLegendClick}
                          />
                          {Array.from(enemyData.players).map((player: any, index) => (
                            <Line 
                              key={player}
                              type="monotone" 
                              dataKey={player} 
                              name={player}
                              hide={hiddenPlayers.has(player)}
                              stroke={playerClasses[player] ? WOW_CLASS_COLORS[playerClasses[player]] || COLORS[index % COLORS.length] : COLORS[index % COLORS.length]} 
                              strokeWidth={2}
                              dot={false}
                              activeDot={{ r: 6, strokeWidth: 0 }}
                              isAnimationActive={false}
                            />
                          ))}
                          {refAreaLeft && refAreaRight ? (
                            <ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#10b981" fillOpacity={0.2} />
                          ) : null}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  
                  {/* Table */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-zinc-800 flex items-center">
                      <TableIcon className="w-5 h-5 mr-2 text-emerald-500" />
                      <h2 className="text-lg font-medium">Threat Summary</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-zinc-400 uppercase bg-zinc-950/50">
                          <tr>
                            <th className="px-6 py-3 font-medium">Player</th>
                            <th className="px-6 py-3 font-medium">Max Threat</th>
                            <th className="px-6 py-3 font-medium">TPS</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {tableData.map((row) => (
                            <tr key={row.name} className="hover:bg-zinc-800/50 transition-colors">
                              <td 
                                className="px-6 py-4 font-medium" 
                                style={{ color: playerClasses[row.name] ? WOW_CLASS_COLORS[playerClasses[row.name]] : '#e4e4e7' }}
                              >
                                {row.name}
                              </td>
                              <td className="px-6 py-4 text-zinc-300">{row.maxThreat.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                              <td className="px-6 py-4 text-zinc-300">{row.tps}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-zinc-500">
                  Select an enemy to view threat data
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
