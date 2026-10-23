/* Full Tamerlane Chess — board UI.
   Three ways to play:
   - This device: pass-and-play. On a hosted copy the page address also carries the game (#g=…),
     so a game can be sent as a link.
   - Online (hosted copy with js/firebase-config.js filled in): game rooms in Firestore, opened
     by invite link (#play=<id>). Firestore security rules enforce seats and turn order.
   - Shared game (when the page runs as a Claude artifact): one live game in the artifact's store.
   The two live modes share one code path through a small backend adapter. */
'use strict';
const IN_CLAUDE=!!(window.claude&&typeof window.claude.use==='function');
const HOSTED=!IN_CLAUDE;
const ONLINE_LABEL=IN_CLAUDE?'Shared game':'Online';

/* ===================== STATE ===================== */
const LS_LOCAL='tfc.local.v1', LS_MODE='tfc.mode.v1', LS_LAST='tfc.online.last';
const lsGet=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
const lsSet=(k,v)=>{ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){} };
function loadLocal(){
  try{ const o=JSON.parse(lsGet(LS_LOCAL)||'null'); if(o&&Array.isArray(o.moves)) return {rules:o.rules==='forbes'?'forbes':'cazaux',moves:o.moves.filter(x=>typeof x==='string'),ended:o.ended||null}; }catch(e){}
  return {rules:'cazaux',moves:[],ended:null};
}
const GAME_ID=/^[A-Za-z0-9]{6,40}$/;

const app={
  mode:'local',              // 'local' | 'online'
  local:loadLocal(),
  net:{
    avail:IN_CLAUDE?'checking':'checking', // 'checking' | 'yes' | 'no'
    connect:null,            // () => Promise<api>
    api:null,                // {kind:'claude'|'firebase', me, doc(id), create?, rematch?}
    status:'off',            // 'off' | 'connecting' | 'lobby' | 'loading' | 'ready' | 'missing' | 'error'
    gameId:null, ref:null, doc:null, unsub:null,
    readOnly:false, writing:false, autoClaim:false, error:'',
  },
  me:null,user:null,isOwner:false,
  sel:null,flip:false,panel:null,sheet:null,tab:'pieces',pendingLink:null,
  toast:'',toastKind:'',codeDraft:'',
  newRules:null,newSwap:true,newSide:'w',newFromPos:false,
};
const isFirebase=()=>!!(app.net.api&&app.net.api.kind==='firebase');
const isClaude=()=>!!(app.net.api&&app.net.api.kind==='claude');
function setLocal(next){ app.local=next; lsSet(LS_LOCAL,JSON.stringify(next)); if(app.mode==='local') syncHash(); }

function current(){
  if(app.mode==='local') return {rules:app.local.rules,moves:app.local.moves,ended:app.local.ended,drawOffer:null,white:null,black:null,live:false};
  const d=app.net.doc;
  if(!d) return {rules:app.newRules||'cazaux',moves:[],ended:null,drawOffer:null,white:null,black:null,live:true,empty:true};
  return {rules:d.rules==='forbes'?'forbes':'cazaux',moves:Array.isArray(d.moves)?d.moves.filter(x=>typeof x==='string'):[],ended:d.ended&&typeof d.ended==='object'?d.ended:null,drawOffer:d.drawOffer==='w'||d.drawOffer==='b'?d.drawOffer:null,white:d.white||null,black:d.black||null,next:typeof d.next==='string'?d.next:null,live:true};
}

// Replays are cached and extended move by move. Live games are replayed strictly, because the
// server only checks turn order: a move that is not legal stops the board there.
let raw=null, memoKey=null, memo=null;
function view(){
  const g=current(), strict=g.live;
  const key=(strict?'s':'l')+'|'+g.rules+'|'+g.moves.join(' ');
  if(key!==memoKey){
    const reuse=raw&&raw.strict===strict&&raw.rules===g.rules&&raw.codes.length<=g.moves.length&&raw.codes.every((c,i)=>c===g.moves[i])&&raw.applied===raw.codes.length;
    const r=replay(g.rules,g.moves,strict,reuse?raw:null);
    raw={...r,strict,rules:g.rules,codes:g.moves.slice(0,r.applied)};
    let st=r.st; const log=r.log.slice();
    const legal=legalMoves(st); const chkSq=st.result?-1:inCheck(st);
    if(!st.result&&legal.length===0){
      st={...st,result:{winner:opp(st.turn),reason:chkSq>=0?'checkmate':'stalemate'}};
      if(log.length) log[log.length-1]=log[log.length-1].replace(/\+$/,'')+'#';
    }
    memo={st,log,caps:r.caps,legal,chk:chkSq,illegalAt:r.applied<g.moves.length?r.applied:-1};
    memoKey=key;
  }
  return {...memo,g,result:g.ended||memo.st.result};
}
function myColors(g){
  if(app.mode==='local') return ['w','b'];
  const out=[]; if(app.me&&g.white===app.me) out.push('w'); if(app.me&&g.black===app.me) out.push('b'); return out;
}
function liveReady(){ return app.mode==='online'&&app.net.status==='ready'&&!!app.net.doc; }
function canMoveNow(v){
  if(v.result||v.illegalAt>=0) return false;
  if(app.mode==='local') return true;
  if(!liveReady()||app.net.readOnly) return false;
  return myColors(v.g).includes(v.st.turn);
}
function flipped(v){
  if(app.mode==='local') return app.flip;
  const mine=myColors(v.g); return mine.length===1&&mine[0]==='b'?!app.flip:app.flip;
}

/* ===================== ADDRESS (hosted copy only) ===================== */
// #g=cazaux.f4-f5.f7-f6 … with ">" written "_" and "!" written "*"; a final rw/rb/dd records a resignation or agreed draw.
function hashFor(g){
  const parts=[g.rules].concat(g.moves.map(m=>m.replace('>','_').replace('!','*')));
  if(g.ended) parts.push(g.ended.reason==='agreed'?'dd':g.ended.winner==='w'?'rb':'rw');
  return '#g='+parts.join('.');
}
function parseHash(h){
  if(!h||h.indexOf('#g=')!==0) return null;
  let body; try{ body=decodeURIComponent(h.slice(3)); }catch(e){ return null; }
  const parts=body.split('.').filter(Boolean);
  const rules=parts.shift(); if(rules!=='cazaux'&&rules!=='forbes') return null;
  let ended=null;
  if(parts.length&&/^(rw|rb|dd)$/.test(parts[parts.length-1])){ const e=parts.pop(); ended=e==='dd'?{winner:null,reason:'agreed'}:{winner:e==='rw'?'b':'w',reason:'resign'}; }
  return {rules,moves:parts.map(t=>t.replace('_','>').replace('*','!')),ended};
}
function setHash(h){
  if(!HOSTED) return;
  const want=h||'';
  if(location.hash===want||(!want&&!location.hash)) return;
  try{ history.replaceState(null,'',want?want:location.pathname+location.search); }catch(e){ location.hash=want; }
}
function syncHash(){ if(HOSTED&&app.mode==='local') setHash(hashFor(app.local)); }
const pageUrl=()=>location.href.split('#')[0];
const isPrefix=(a,b)=>a.length<=b.length&&a.every((x,i)=>x===b[i]);
function adoptHash(){
  if(!HOSTED) return;
  if(!location.hash||location.hash.indexOf('#g=')!==0){ syncHash(); return; }
  const h=parseHash(location.hash);
  if(!h){ toast('That link does not hold a game this board can read.','warn'); syncHash(); return; }
  const r=replay(h.rules,h.moves,true);
  if(r.applied!==h.moves.length){ toast(`The linked game has an illegal move at move ${r.applied+1}, so it was not opened.`,'warn'); syncHash(); return; }
  const cur=app.local, same=cur.rules===h.rules;
  if(same&&cur.moves.length===h.moves.length&&isPrefix(cur.moves,h.moves)&&JSON.stringify(cur.ended)===JSON.stringify(h.ended)) return;
  if((!cur.moves.length&&!cur.ended)||(same&&isPrefix(cur.moves,h.moves)&&!cur.ended)){ openLinked(h,r.st); return; }
  app.pendingLink={...h,turn:r.st.turn};
}
function openLinked(h,st){
  app.pendingLink=null; app.sel=null;
  setLocal({rules:h.rules,moves:h.moves,ended:h.ended});
  app.flip=!st.result&&st.turn==='b';
  const v=view();
  toast(v.result?'Opened the finished game from the link.':`Opened the game from the link. ${CN[v.st.turn]} to move.`);
}
function onHashChange(){
  const h=location.hash;
  if(h.indexOf('#play=')===0){ const id=h.slice(6); if(app.mode!=='online'||id!==app.net.gameId) goOnline(id); return; }
  if(h.indexOf('#g=')===0){ if(app.mode!=='local') leaveOnline(); app.mode='local'; adoptHash(); render(); }
}

/* ===================== LIVE GAMES ===================== */
function leaveOnline(){
  const n=app.net; if(n.unsub){ try{ n.unsub(); }catch(e){} }
  n.unsub=null; n.ref=null; n.doc=null; n.gameId=null; n.autoClaim=false;
}
async function goOnline(id,opts){
  opts=opts||{};
  if(app.net.avail!=='yes'){ toast(HOSTED?'Online play is not set up on this copy of the board.':'Shared play is not available in this view.','warn'); render(); return; }
  leaveOnline();
  app.mode='online'; app.sel=null; app.panel=null; app.flip=false;
  if(IN_CLAUDE) lsSet(LS_MODE,'online');
  const n=app.net;
  if(id&&!GAME_ID.test(id)&&!(IN_CLAUDE&&id==='current')){ id=null; toast('That game link is incomplete. Ask for the link again.','warn'); }
  n.gameId=id||null; n.autoClaim=!!opts.autoClaim; n.readOnly=!!n.viewOnly;
  if(HOSTED) setHash(id?'#play='+id:'');
  if(!n.api){
    n.status='connecting'; render();
    try{ n.api=await n.connect(); app.me=n.api.me; }
    catch(e){ console.error(e); n.status='error'; n.error=connectError(e); render(); return; }
    if(app.mode!=='online'||n.gameId!==(id||null)) return; // the player moved on while connecting
  }
  if(!id){ n.status='lobby'; render(); return; }
  if(HOSTED) lsSet(LS_LAST,id);
  n.status='loading'; render();
  const ref=n.api.doc(id); n.ref=ref;
  n.unsub=ref.onSnapshot(snap=>{ if(n.ref===ref) onGameSnap(snap); },err=>{
    if(n.ref!==ref) return;
    console.error(err);
    n.status='error'; n.error=err&&(err.code==='permission-denied'||err.code==='revoked')?'You do not have access to this game.':'The game could not be loaded. Check your connection and reload the page.';
    render();
  });
}
function connectError(e){
  const c=e&&e.code||'';
  if(c==='auth/operation-not-allowed'||c==='auth/admin-restricted-operation') return 'Anonymous sign-in is turned off in this Firebase project, so online play cannot start.';
  if(c==='auth/unauthorized-domain') return 'This web address is not on the Firebase project’s list of authorized domains.';
  if(c==='auth/network-request-failed') return 'Could not reach the online server. Check your connection and reload the page.';
  return 'Could not connect to the online server. Reload the page to try again.';
}
function onGameSnap(snap){
  const n=app.net, prev=n.doc;
  n.doc=snap.exists?snap.data():null;
  n.status=n.doc||isClaude()?'ready':'missing';
  const d=n.doc;
  if(prev&&d&&Array.isArray(prev.moves)&&Array.isArray(d.moves)&&prev.moves.length!==d.moves.length) app.sel=null;
  if(d&&isFirebase()){
    const g=current(), mine=myColors(g);
    // Follow a rematch automatically if you played in this game.
    if(g.next&&mine.length){ goOnline(g.next,{autoClaim:true}); return; }
    // Coming from a rematch: take the seat that was left for you.
    if(n.autoClaim&&!mine.length){
      n.autoClaim=false;
      const open=!g.white?'w':!g.black?'b':null;
      if(open){ claimSeat(open,true); }
    }
  }
  render();
}

/* ===================== RENDER ===================== */
const $=id=>document.getElementById(id);
function tok(p,extra){
  const cls=['tok',p.c];
  if(p.t==='P') cls.push('pawn');
  if(ROYAL[p.t]) cls.push('royal');
  if(immune(p)) cls.push('parked');
  if(extra) cls.push(extra);
  return `<span class="${cls.join(' ')}" aria-hidden="true"><i class="ico i-${iconKey(p)}"></i></span>`;
}
function selInfo(v){
  const s=app.sel; if(s==null) return null;
  const p=v.st.board[s]; if(!p) return null;
  if(p.c===v.st.turn&&canMoveNow(v)) return {own:true,p,moves:v.legal.filter(m=>m.f===s)};
  const tmp=[]; targets(v.st.board,s,p,v.g.rules,tmp);
  return {own:false,p,peek:tmp};
}
let lastDrawnPly=null;
function renderBoard(v){
  const st=v.st, b=st.board, fl=flipped(v), info=selInfo(v);
  const marks=new Map();
  if(info){
    if(info.own) for(const m of info.moves){ const special=m.k!=='m'||m.t>=110; const cap=m.k==='ks'||!!b[m.t]; marks.set(m.t,(cap?'cap':'mv')+(special?' alt':'')); }
    else for(const d of info.peek) marks.set(d,(b[d]?'cap':'mv')+' peek');
  }
  const last=st.last, html=[];
  const plyKey=v.g.rules+'|'+v.log.length, animate=lastDrawnPly!==null&&lastDrawnPly!==plyKey;
  lastDrawnPly=plyKey;
  const place=(gx,gy)=>{ const col=fl?(10-gx)+2:gx+2, row=fl?gy+1:10-gy; return `grid-column:${col};grid-row:${row}`; };
  const cell=(s,gx,gy)=>{
    const p=b[s], cls=['sq'];
    if(s>=110) cls.push('cit');
    if(last&&(last.f===s||last.t===s)) cls.push('last');
    if(app.sel===s) cls.push('sel');
    if(marks.has(s)) cls.push(marks.get(s));
    let label=s===WC?"White's citadel":s===BC?"Black's citadel":nm(s);
    if(p) label+=', '+CN[p.c].toLowerCase()+' '+pieceName(p);
    let t='';
    if(p){ const extra=[]; if(v.chk===s) extra.push('chk'); if(animate&&last&&last.t===s) extra.push('arrive'); t=tok(p,extra.join(' ')); }
    html.push(`<button class="${cls.join(' ')}" style="${place(gx,gy)}" data-sq="${s}" aria-label="${label}">${t}</button>`);
  };
  for(let s=0;s<110;s++) cell(s,X(s),Y(s));
  cell(WC,11,1); cell(BC,-1,8);
  for(let y=0;y<10;y++){
    if(y!==8) html.push(`<span class="lbl" style="${place(-1,y)}">${y+1}</span>`);
    if(y!==1) html.push(`<span class="lbl" style="${place(11,y)}">${y+1}</span>`);
  }
  for(let x=0;x<11;x++){ const col=fl?(10-x)+2:x+2; html.push(`<span class="lbl" style="grid-column:${col};grid-row:11">${FILES[x]}</span>`); }
  html.push('<div class="frame"></div>');
  $('board').innerHTML=html.join('');
}
function seatOpenForMe(g){ return liveReady()&&!!app.me&&!app.net.readOnly&&myColors(g).length===0; }
function renderStrip(el,c,v){
  const g=v.g, over=!!v.result, turn=!over&&v.st.turn===c&&!(app.mode==='online'&&!liveReady());
  const caps=v.caps[c].map(p=>tok(p,'mini')).join('');
  let who=`<span class="chip ${c}"></span>`;
  if(app.mode==='local'||!liveReady()){ who+=`<span class="pname">${CN[c]}</span>`; }
  else {
    const uid=c==='w'?g.white:g.black;
    if(uid){
      if(isClaude()) who+=`<img class="avatar" alt="" data-avatar="${uid}" hidden><span class="pname" data-uid="${uid}">${CN[c]}</span>`;
      else who+=`<span class="pname">${CN[c]}${uid===app.me?' (you)':''}</span>`;
    }
    else if(seatOpenForMe(g)) who+=`<span class="pname">${CN[c]}</span><button class="btn small" data-act="sit" data-v="${c}">Sit here</button>`;
    else who+=`<span class="pname">${CN[c]}</span><span class="small">seat open</span>`;
  }
  el.innerHTML=`<div class="who">${who}${turn?'<span class="tomove">to move</span>':''}</div><div class="caps" aria-label="Pieces captured by ${CN[c]}">${caps}</div>`;
}
function statusText(v){
  if(app.mode==='online'){
    const s=app.net.status;
    if(s==='connecting') return 'Connecting…';
    if(s==='loading') return 'Loading the game…';
    if(s==='error') return 'Online play is unavailable';
    if(s==='lobby') return 'Start an online game';
    if(s==='missing') return 'No game at this link';
    if(!app.net.doc) return 'No shared game yet';
  }
  const r=v.result, st=v.st;
  if(r){
    if(r.reason==='checkmate') return `${CN[r.winner]} wins by checkmate`;
    if(r.reason==='stalemate') return `${CN[r.winner]} wins: ${CN[opp(r.winner)]} has no legal move`;
    if(r.reason==='citadel') return `Draw: ${CN[r.by]} reached ${CN[opp(r.by)]}'s citadel`;
    if(r.reason==='resign') return `${CN[opp(r.winner)]} resigned. ${CN[r.winner]} wins`;
    if(r.reason==='agreed') return 'Draw agreed';
    return 'Game over';
  }
  if(v.illegalAt>=0) return 'Game stopped at an illegal move';
  let s=`${CN[st.turn]} to move`;
  if(app.mode==='online'){
    const g=v.g, mine=myColors(g), seat=st.turn==='w'?g.white:g.black;
    if(!seat) s=`${CN[st.turn]} to move · seat open`;
    else if(mine.includes(st.turn)&&!app.net.readOnly) s='Your move';
    else if(mine.length) s=`Waiting for ${CN[st.turn]}`;
  }
  return s;
}
function renderActions(v){
  const a=[], over=!!v.result, g=v.g;
  if(app.mode==='local'){
    if(HOSTED) a.push(`<button class="btn primary" data-act="send-link">Send link</button>`);
    a.push(`<button class="btn" data-act="undo" ${g.moves.length||g.ended?'':'disabled'}>Undo</button>`);
    a.push(`<button class="btn" data-act="flip">Flip board</button>`);
    if(!over){ a.push(`<button class="btn" data-act="draw-local">Agree a draw</button>`); a.push(`<button class="btn danger" data-act="resign">${CN[v.st.turn]} resigns</button>`); }
    a.push(`<button class="btn ${HOSTED?'':'primary'}" data-act="new">New game</button>`);
  } else if(liveReady()){
    const mine=myColors(g), can=!app.net.readOnly&&mine.length>0;
    const lastMover=g.moves.length?(g.moves.length%2===1?'w':'b'):null;
    if(isFirebase()){ const inviting=mine.length&&(!g.white||!g.black); a.push(`<button class="btn ${inviting?'primary':''}" data-act="invite">${inviting?'Send invite link':'Copy game link'}</button>`); }
    if(can&&!over&&v.illegalAt<0&&lastMover&&mine.includes(lastMover)) a.push(`<button class="btn" data-act="undo">Take back my move</button>`);
    a.push(`<button class="btn" data-act="flip">Flip board</button>`);
    if(can&&!over){
      const myC=mine.includes(v.st.turn)?v.st.turn:mine[0];
      if(g.drawOffer&&g.drawOffer!==myC){ a.push(`<button class="btn primary" data-act="draw-accept">Accept draw</button>`); a.push(`<button class="btn" data-act="draw-decline">Decline draw</button>`); }
      else if(g.drawOffer===myC) a.push(`<button class="btn" data-act="draw-decline">Withdraw draw offer</button>`);
      else a.push(`<button class="btn" data-act="draw-offer">Offer a draw</button>`);
      a.push(`<button class="btn danger" data-act="resign">Resign</button>`);
    }
    if(isClaude()){
      if(!app.net.readOnly&&(mine.length||app.isOwner)) a.push(`<button class="btn ${over?'primary':''}" data-act="new">New game</button>`);
      if(can) a.push(`<button class="btn" data-act="leave">Leave my seat</button>`);
    } else if(can) a.push(`<button class="btn ${over?'primary':''}" data-act="new">${over?'Rematch':'New game'}</button>`);
  } else if(app.mode==='online'&&isFirebase()&&(app.net.status==='missing')){
    a.push(`<button class="btn primary" data-act="lobby">Start an online game</button>`);
  }
  $('actions').innerHTML=a.join('');
}
function rulesChoices(rules){
  return ['cazaux','forbes'].map(k=>`<label class="choice"><input type="radio" name="rules" id="rules-${k}" value="${k}" ${rules===k?'checked':''}><div><b>${RULESET[k][0]}</b><span>${RULESET[k][1]}</span></div></label>`).join('');
}
function renderPanel(v){
  const el=$('panel'), P=app.panel, g=v.g, n=app.net;
  if(P&&P.kind==='confirm'){
    el.innerHTML=`<div class="card"><p>${P.text}</p><div class="row"><button class="btn ${P.danger?'danger':'primary'}" data-act="confirm-yes">${P.label}</button><button class="btn" data-act="cancel">Cancel</button></div></div>`;
    return;
  }
  if(P&&P.kind==='link'){
    el.innerHTML=`<div class="card"><h3>${P.title||'Send this link'}</h3><p>${P.text||'Copy it and send it to your opponent.'}</p><input class="linkfield" id="link-out" readonly value="${escapeHTML(P.url)}" aria-label="Link"><div class="row"><button class="btn" data-act="cancel">Done</button></div></div>`;
    const f=$('link-out'); if(f){ f.focus(); f.select(); }
    return;
  }
  if(P&&P.kind==='new'){
    const rules=app.newRules||g.rules||'cazaux';
    let extra='', lead='The manuscript shows where the lion, bull and revealer stand, but not how they move. Pick a reconstruction for this game.', go='Start new game';
    if(app.mode==='online'&&isClaude()&&(g.white||g.black)) extra=`<label class="choice"><input type="checkbox" id="swap" ${app.newSwap?'checked':''}><div><b>Swap colours</b><span>White and Black trade seats for the next game.</span></div></label>`;
    if(app.mode==='online'&&isFirebase()){
      lead='A new game opens for both of you. Your opponent’s board follows automatically.'; go='Start the new game';
      extra=`<label class="choice"><input type="checkbox" id="swap" ${app.newSwap?'checked':''}><div><b>Swap colours</b><span>You play ${CN[opp(myColors(g)[0]||'w')]} next game.</span></div></label>`;
    }
    el.innerHTML=`<div class="card"><h3>New game</h3><p>${lead}</p><div class="choices">${rulesChoices(rules)}${extra}</div><div class="row"><button class="btn primary" data-act="new-start">${go}</button><button class="btn" data-act="cancel">Cancel</button></div></div>`;
    return;
  }
  if(app.mode!=='online'){ el.innerHTML=''; return; }
  // Live-game panels that follow from the game's state rather than from a button.
  if(n.status==='error'){ el.innerHTML=`<div class="card"><h3>Online play is unavailable</h3><p>${escapeHTML(n.error||'')}</p><div class="row"><button class="btn" data-act="mode" data-v="local">Play on this device</button></div></div>`; return; }
  if(n.status==='missing'){ el.innerHTML=`<div class="card"><h3>No game at this link</h3><p>The link may be cut off. Ask your opponent to send it again, or start a new game.</p></div>`; return; }
  if(n.status==='lobby'){
    const rules=app.newRules||'cazaux', lm=app.local.moves.length;
    const sides=[['w','White','You move first.'],['b','Black','Your opponent moves first.']].map(([k,l,s])=>`<label class="choice"><input type="radio" name="side" id="side-${k}" value="${k}" ${app.newSide===k?'checked':''}><div><b>Play ${l}</b><span>${s}</span></div></label>`).join('');
    const fromPos=lm&&!app.local.ended?`<label class="choice"><input type="checkbox" id="frompos" ${app.newFromPos?'checked':''}><div><b>Start from the position on this device</b><span>Carries over the ${lm} move${lm===1?'':'s'} played on this device.</span></div></label>`:'';
    el.innerHTML=`<div class="card"><h3>Start an online game</h3><p>You get an invite link to send. When your opponent opens it, they take the other seat and moves appear on both boards as they are played.</p><div class="choices">${sides}${rulesChoices(rules)}${fromPos}</div><div class="row"><button class="btn primary" data-act="create">Create game</button></div><p class="small" style="margin-top:10px">Got an invite? Open the link you were sent.</p></div>`;
    return;
  }
  if(n.status!=='ready'){ el.innerHTML=''; return; }
  if(!n.doc){
    if(isClaude()&&(n.readOnly||!app.me)){ el.innerHTML=`<div class="card"><h3>No game on this board yet</h3><p>The owner of this page starts the shared game. Once it exists you can follow it here.</p></div>`; return; }
    const rules=app.newRules||'cazaux';
    el.innerHTML=`<div class="card"><h3>Start a shared game</h3><p>You will sit as White. Your friend opens this page and takes the Black seat.</p><div class="choices">${rulesChoices(rules)}</div><div class="row"><button class="btn primary" data-act="create">Start game</button></div></div>`;
    return;
  }
  const mine=myColors(g);
  const html=[];
  if(v.illegalAt>=0) html.push(`<div class="card"><h3>The board stops at move ${v.illegalAt+1}</h3><p>That move is not legal on this board, so it was probably made outside it. The game cannot continue from here. Start a new game, or load an earlier position from a game code.</p></div>`);
  if(isFirebase()&&mine.length&&(!g.white||!g.black)){
    const url=pageUrl()+'#play='+n.gameId;
    html.push(`<div class="card"><h3>Invite your opponent</h3><p>Send them this link. They take the ${CN[!g.white?'w':'b']} seat when they open it.</p><input class="linkfield" id="invite-out" readonly value="${escapeHTML(url)}" aria-label="Invite link"><div class="row"><button class="btn primary" data-act="invite">Send invite link</button></div></div>`);
  } else if(isFirebase()&&!mine.length&&(!g.white||!g.black)&&app.me){
    const open=!g.white?'w':'b';
    html.push(`<div class="card"><h3>Join this game</h3><p>You have been invited to play ${CN[open]}${g.moves.length?`, with ${g.moves.length} move${g.moves.length===1?'':'s'} already played`:''}.</p><div class="row"><button class="btn primary" data-act="sit" data-v="${open}">Play as ${CN[open]}</button></div></div>`);
  } else if(isFirebase()&&!mine.length){
    html.push(`<div class="card"><p>Both seats are taken, so you are watching this game.</p></div>`);
  }
  el.innerHTML=html.join('');
}
function renderInfo(v){
  const el=$('info'), s=app.sel, p=s!=null?v.st.board[s]:null, rules=v.g.rules;
  if(!p){
    el.innerHTML=`<div class="info"><div><h2>Tap a piece</h2><p>Its name and move appear here, with its reachable squares on the board. Tap an opponent's piece to see what it threatens.</p><div class="meta">${RULESET[rules][0].toUpperCase()} RECONSTRUCTION · ${v.log.length} PLY</div></div></div>`;
    return;
  }
  let title, tr, body, meta=CN[p.c]+' · '+(s===WC?"White's citadel":s===BC?"Black's citadel":nm(s));
  if(p.t==='P'){
    title='Pawn of '+PL[p.of]; tr=NAME.P[1];
    body=p.of==='P'?PAWN_DESC+' '+POP_STAGE[p.st||0]:PAWN_DESC+' Promotes to '+promotesTo(p.of)+'.';
  } else {
    title=NAME[p.t][0]; tr=NAME[p.t][1]; body=describe(p.t,rules);
    if(p.t==='L'||p.t==='B'||p.t==='X') body+=` <span class="small">(${RULESET[rules][0]} reading.)</span>`;
    if(p.t==='K'){ const f=v.st.flags[p.c]; body+=` <span class="small">Escape swap ${f.swap?'used':'still available'}.${f.cit?' Citadel swap used.':''}</span>`; }
  }
  const info=selInfo(v);
  if(info&&info.own) meta+=' · '+info.moves.length+' legal move'+(info.moves.length===1?'':'s');
  el.innerHTML=`<div class="info">${tok(p,'big')}<div><h2>${title}</h2><div class="tr">${tr}</div><p>${body}</p><div class="meta">${meta.toUpperCase()}</div></div></div>`;
}
const TABS=[['pieces','Pieces'],['moves','Moves'],['rules','Rules'],['friend','Play a friend']];
function friendText(){
  if(IN_CLAUDE) return `
<h4>Play online</h4>
<p>Use <b>Shared game</b> at the top. Both players see the same board and moves arrive live, so you can play in one sitting or a move a day.</p>
<ul><li>Share this page with your friend from the share menu and invite them by email as an <b>Editor</b>. Viewers and people arriving by a public link can watch but cannot move.</li>
<li>Avoid turning on a public link as well: an outside Editor loses the ability to move while the page is also shared by link.</li>
<li>Each of you taps <b>Sit here</b> on a side. Black's board turns around automatically.</li></ul>
<h4>Over the board</h4>
<p>Choose <b>This device</b> and pass the phone. The game is kept in this browser.</p>`;
  const online=app.net.avail==='yes'?`
<h4>Play online</h4>
<ol><li>Choose <b>Online</b> at the top and create a game.</li>
<li>Send the invite link to your opponent.</li>
<li>They open it and take the other seat. Moves appear on both boards as they are played, and only the player whose turn it is can move.</li></ol>
<p>Your seat belongs to this browser on this device. If you change device or clear your browser data, you can no longer move in that game; copy its game code below and start a new online game from that position.</p>`:'';
  return `${online}
<h4>Play by link</h4>
<ol><li>On <b>This device</b>, make your move.</li>
<li>Tap <b>Send link</b> and send it to your opponent by text or email.</li>
<li>They open it, see your move, reply, and send a link back.</li></ol>
<p>The link holds the whole game, so the newest link is the game. Anyone with a link can move either side, so send it only to your opponent.</p>
<h4>Over the board</h4>
<p>Pass the phone. The game stays in this browser and in the page address.</p>`;
}
function renderTabs(v){
  $('tabs').innerHTML=TABS.map(([k,l])=>`<button role="tab" aria-selected="${app.tab===k}" data-act="tab" data-v="${k}" id="tab-${k}">${l}</button>`).join('');
  const el=$('tabpanel'), rules=v.g.rules;
  if(app.tab==='pieces'){
    const order=['K','F','S','G','T','N','R','E','C','W','L','B','X'];
    const rows=order.map(t=>`<div class="prow">${tok({t,c:'w'},'list')}<div class="pt"><b>${NAME[t][0]}</b> <i>${NAME[t][1]}</i><span class="ab">${GL[t]}</span>${'LBX'.includes(t)?'<span class="tag">reconstructed</span>':''}<p>${describe(t,rules)}</p></div></div>`);
    rows.push(`<div class="prow">${tok({t:'PR',c:'w'},'list')}<div class="pt"><b>Prince</b> <i>${NAME.PR[1]}</i><span class="ab">Pr</span><p>${DESC.PR}</p></div></div>`);
    rows.push(`<div class="prow">${tok({t:'AK',c:'w'},'list')}<div class="pt"><b>Adventitious king</b> <i>${NAME.AK[1]}</i><span class="ab">AK</span><p>${DESC.AK}</p></div></div>`);
    rows.push(`<div class="prow">${tok({t:'P',of:'G',c:'w'},'list')}<div class="pt"><b>Pawns</b><p>${PAWN_DESC} Each pawn wears a small copy of its piece's icon and becomes that piece on the last rank. A pawn of kings becomes a prince.</p></div></div>`);
    rows.push(`<div class="prow">${tok({t:'P',of:'P',c:'w'},'list')}<div class="pt"><b>Pawn of pawns</b><p>Has three lives. First arrival: parks on the last rank and cannot be captured, until you place it on a square where it forks two pieces or attacks one that cannot move. Second arrival: returns to the pawn-of-kings square. Third: becomes an adventitious king.</p></div></div>`);
    el.innerHTML=`<div class="plist">${rows.join('')}</div>`;
  } else if(app.tab==='moves'){
    if(!v.log.length){ el.innerHTML='<p class="empty">No moves yet. White opens.</p>'; return; }
    const cells=[];
    for(let i=0;i<v.log.length;i+=2){
      cells.push(`<span class="n">${i/2+1}.</span><span class="${i===v.log.length-1?'cur':''}">${v.log[i]}</span><span class="${i+1===v.log.length-1?'cur':''}">${v.log[i+1]||''}</span>`);
    }
    el.innerHTML=`<div class="log" id="log">${cells.join('')}</div><p class="small">Letters are the piece abbreviations from the Pieces tab; pawn moves have none. ⌂ citadel · ⇄ swap · ⇒ pawn of pawns placed · = promotes · + check · # mate or stalemate</p>`;
    const lg=$('log'); if(lg) lg.scrollTop=lg.scrollHeight;
  } else if(app.tab==='rules'){
    el.innerHTML=`
<h4>Winning</h4>
<ul><li>Checkmate wins. So does stalemate: a side with no legal move loses.</li>
<li>Capturing everything but the king does not win, because a lone king can still reach the enemy citadel.</li>
<li>No castling, no en passant, no double pawn step, and no draw by repetition or move count.</li></ul>
<h4>Citadels</h4>
<ul><li>The hatched squares beside k2 (White's) and a9 (Black's).</li>
<li>Your highest royal piece (king, then prince, then adventitious king) may step into the enemy citadel. That draws the game.</li>
<li>If your king gets there while you also have a prince or adventitious king, you may instead swap the king with that piece, once per game, and play on.</li>
<li>Only the adventitious king may enter its own citadel. Nothing can be captured in a citadel.</li></ul>
<h4>Royal pieces</h4>
<ul><li>With one royal piece, check works as usual. With two or more, you may leave them attacked and they can be captured until one is left.</li>
<li>Once per game the king may escape by trading places with one of your pieces, when it is in check or you have no other move.</li></ul>
<h4>The full array</h4>
<p>This setup comes from manuscript 7322, which reproduces Ibn ʿArabshāh's 15th-century account of Timur. It adds two lions, two bulls and a revealer, puts a sea monster where the vizier stood, and has three knights and one camel. The manuscript does not say how the new pieces move. This board offers two readings: <b>${RULESET.cazaux[0]}</b> and <b>${RULESET.forbes[0]}</b>. This game uses ${RULESET[rules][0]}.</p>
<h4>How this board settles unclear points</h4>
<ul><li>Placing the parked pawn of pawns is optional here; some sources say it is compulsory.</li>
<li>"Attacks a piece that cannot escape" is read as attacking a piece with no legal move.</li>
<li>If the pawn-of-kings square is taken when the pawn of pawns returns, it goes to the nearest empty square on that rank.</li>
<li>The king's escape swap cannot put a pawn on its own last rank.</li></ul>
<h4>Sources</h4>
<ul><li><a href="https://en.wikipedia.org/wiki/Great_chess" target="_blank" rel="noopener">Great chess</a>, Wikipedia</li>
<li><a href="http://history.chess.free.fr/tamerlane-full.htm" target="_blank" rel="noopener">Full Tamerlane Chess</a>, Jean-Louis Cazaux</li>
<li><a href="https://www.chessvariants.com/historic.dir/tamerlane.html" target="_blank" rel="noopener">Tamerlane chess</a>, The Chess Variant Pages</li>
<li>Cazaux &amp; Knowlton, <i>A World of Chess</i> (2017), pp. 31–37</li></ul>`;
  } else {
    el.innerHTML=`${friendText()}
<h4>Game code</h4>
<p class="small">The whole game as text, for keeping a copy or moving it to another device.</p>
<textarea id="code-out" readonly aria-label="Current game code">${escapeHTML(gameCode(v.g))}</textarea>
<div class="row" style="margin:8px 0 14px"><button class="btn" data-act="copy-code">Copy code</button></div>
<textarea id="code-in" placeholder="Paste a game code" aria-label="Game code to load">${escapeHTML(app.codeDraft)}</textarea>
<div class="row" style="margin-top:8px"><button class="btn primary" data-act="load-code">Load on this device</button></div>`;
  }
}
function renderSheet(){
  const el=$('sheet'), S=app.sheet;
  if(!S){ el.innerHTML=''; return; }
  el.innerHTML=`<div class="scrim" data-act="sheet-cancel"></div><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title"><div class="inner"><h3 id="sheet-title">${S.title}</h3>${S.text?`<p>${S.text}</p>`:''}${S.options.map((o,i)=>`<button class="opt" data-act="sheet-pick" data-i="${i}"><b>${o.label}</b>${o.sub?`<span>${o.sub}</span>`:''}</button>`).join('')}<button class="btn" data-act="sheet-cancel">Cancel</button></div></div>`;
  const first=el.querySelector('.opt'); if(first) first.focus();
}
function renderHeader(v){
  const av=app.net.avail;
  if(av==='yes'||(IN_CLAUDE&&av!=='checking')) $('modes').innerHTML=`<button data-act="mode" data-v="online" aria-pressed="${app.mode==='online'}" ${av==='yes'?'':'disabled title="Not available in this view"'}>${ONLINE_LABEL}</button><button data-act="mode" data-v="local" aria-pressed="${app.mode==='local'}">This device</button>`;
  else $('modes').innerHTML='';
  $('rulesline').innerHTML=`Extra pieces: <b>${RULESET[v.g.rules][0]}</b> reading`;
  let ban='';
  const L=app.pendingLink;
  if(L&&app.mode==='local'){
    ban=`<div class="banner"><b>This link holds a different game</b> from the one on this device (${L.moves.length} move${L.moves.length===1?'':'s'}, ${L.ended?'finished':CN[L.turn]+' to move'}).<div class="row"><button class="btn primary" data-act="link-open">Open the linked game</button><button class="btn" data-act="link-keep">Keep this device's game</button></div></div>`;
  } else if(app.mode==='online'&&isClaude()&&app.net.doc){
    if(app.net.readOnly) ban=`<div class="banner">You are watching. To move pieces, ask the owner of this page to invite you by email as an Editor.</div>`;
    else if(!app.me) ban=`<div class="banner">Sign in to take a seat. You can still watch the game.</div>`;
  } else if(IN_CLAUDE&&av==='no'){
    ban=`<div class="banner">Shared play isn't available in this view. Pass-and-play works here.</div>`;
  }
  $('banner').innerHTML=ban;
}
function render(){
  const v=view();
  if(app.sel!=null&&!v.st.board[app.sel]) app.sel=null;
  const fl=flipped(v);
  renderHeader(v);
  renderStrip($('strip-top'),fl?'w':'b',v);
  renderStrip($('strip-bottom'),fl?'b':'w',v);
  renderBoard(v);
  const st=$('status'); st.textContent=statusText(v);
  if(!v.result&&v.chk>=0&&!(app.mode==='online'&&!liveReady())){ const c=document.createElement('span'); c.className='chk'; c.textContent=' · Check'; st.appendChild(c); }
  renderActions(v);
  const t=$('toast'); t.textContent=app.toast; t.className='toast'+(app.toastKind?' '+app.toastKind:'');
  renderPanel(v); renderInfo(v); renderTabs(v); renderSheet();
  fillNames(v);
}
function escapeHTML(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
async function fillNames(v){
  if(app.mode!=='online'||!isClaude()||!app.user) return;
  const ids=[v.g.white,v.g.black].filter(Boolean); if(!ids.length) return;
  let ps; try{ ps=await app.user.profiles(ids); }catch(e){ return; }
  document.querySelectorAll('[data-uid]').forEach(n=>{ const p=ps[n.dataset.uid]; if(p) n.textContent=(p.name||n.textContent||'Player')+(p.isMe?' (you)':''); });
  document.querySelectorAll('[data-avatar]').forEach(n=>{ const p=ps[n.dataset.avatar]; if(p&&p.avatarUrl){ n.src=p.avatarUrl; n.hidden=false; } });
}
let toastTimer=null;
function toast(msg,kind){ app.toast=msg; app.toastKind=kind||''; clearTimeout(toastTimer); if(msg&&kind!=='warn') toastTimer=setTimeout(()=>{ app.toast=''; render(); },4000); }

/* ===================== ACTIONS ===================== */
function gameCode(g){ return ['TC1',g.rules].concat(g.moves).join(' '); }
async function write(patch,ok,what){
  const ref=app.net.ref; if(!ref) return false;
  if(app.net.writing){ toast('Still saving the last change.'); render(); return false; }
  app.net.writing=true;
  try{ await ref.update(patch); if(ok) toast(ok); return true; }
  catch(e){ writeFailed(e,what); return false; }
  finally{ app.net.writing=false; render(); }
}
function writeFailed(e,what){
  console.error(e);
  const code=e&&e.code;
  if(isFirebase()){
    if(code==='permission-denied'){
      if(what==='seat') toast('That seat was just taken.','warn');
      else toast('That change was not accepted because the game changed on the server first. The board now shows the current game.','warn');
    }
    else if(code==='resource-exhausted') toast('The online board has reached its free daily limit. It resets at midnight Pacific time.','warn');
    else if(code==='unauthenticated') toast('You are signed out of online play. Reload the page.','warn');
    else toast('That change was not saved. Check your connection and try again.','warn');
    return;
  }
  if(code==='invalid_argument'||code==='not_granted'){ app.net.readOnly=true; toast('Your move was not saved: this page is view-only for you. The owner can invite you by email as an Editor.','warn'); }
  else if(code==='revoked'){ app.net.readOnly=true; toast('Your access to this page changed, so the board is read-only now.','warn'); }
  else if(code==='quota_exceeded'){ toast('The shared game store is full, so nothing more can be saved.','warn'); }
  else toast('That change was not saved. Check your connection and try again.','warn');
}
function play(m){
  const v=view(), code=encode(m);
  app.sel=null; app.sheet=null;
  if(app.mode==='local'){ setLocal({...app.local,moves:[...app.local.moves,code],ended:null}); render(); return; }
  write({moves:[...v.g.moves,code],drawOffer:null},null,'move');
}
function onSquare(s){
  const v=view(), info=selInfo(v);
  if(info&&info.own){
    const ms=info.moves.filter(m=>m.t===s);
    if(ms.length){
      const b=v.st.board;
      if(ms.length===1&&ms[0].k==='m'&&s<110){ play(ms[0]); return; }
      if(ms.length===1&&ms[0].k==='d'){ play(ms[0]); return; }
      if(ms[0].k==='ks'){
        const q=b[s];
        app.sheet={title:'Use the king’s escape?',text:`Your king trades places with your ${pieceName(q)} on ${nm(s)}. This can be done only once per game.`,options:[{label:`Swap king and ${pieceName(q)}`,move:ms[0]},{label:`Select the ${pieceName(q)} instead`,select:s}]};
        render(); return;
      }
      if(s>=110&&s===enemyCit(v.st.turn)){
        const opts=ms.map(m=>m.k==='m'?{label:'Enter the citadel and draw',sub:'The game ends in a draw.',move:m}:{label:`Swap with your ${pieceName(b[m.x])} on ${nm(m.x)}`,sub:'Once per game. The game goes on.',move:m});
        app.sheet={title:`${CN[v.st.turn]}’s ${pieceName(b[app.sel])} reaches the enemy citadel`,text:'',options:opts};
        render(); return;
      }
      play(ms[0]); return;
    }
  }
  const p=v.st.board[s];
  app.sel=p&&app.sel!==s?s:null;
  render();
}
function askConfirm(text,label,run,danger){ app.panel={kind:'confirm',text,label,run,danger}; render(); }

async function claimSeat(c,quiet){
  const ref=app.net.ref, key=c==='w'?'white':'black';
  if(!ref||!app.me) return;
  if(isClaude()){
    try{
      if(typeof ref.acquire==='function'){
        const r=await ref.acquire({holder:app.me,ttlMs:5000});
        if(!r.acquired){ toast('Someone else is taking a seat right now. Try again in a few seconds.'); render(); return; }
      }
      const snap=await ref.get(); const d=snap.exists?snap.data():null;
      if(!d){ toast('The game was reset. Try again.'); render(); return; }
      if(d[key]){ toast(`The ${CN[c]} seat was just taken.`); render(); return; }
    }catch(e){ writeFailed(e,'seat'); render(); return; }
  }
  await write({[key]:app.me},quiet?`You are playing ${CN[c]}.`:`You are playing ${CN[c]}.`,'seat');
}
function newGameData(rules,side,moves){
  return {v:1,rules,white:side==='w'?app.me:null,black:side==='b'?app.me:null,moves:moves||[],ended:null,drawOffer:null,createdBy:app.me,next:null};
}
async function createOnline(){
  const n=app.net, rules=app.newRules||'cazaux';
  if(isClaude()){
    try{ await n.ref.set({...newGameData(rules,'w',[]),gameNo:1}); toast('Game started. Share this page with your friend.'); }
    catch(e){ writeFailed(e); }
    app.newRules=null; render(); return;
  }
  const moves=app.newFromPos&&!app.local.ended?app.local.moves.slice():[];
  const useRules=app.newFromPos&&!app.local.ended?app.local.rules:rules;
  if(n.writing) return;
  n.writing=true; render();
  try{
    const id=await n.api.create(newGameData(useRules,app.newSide,moves));
    app.newRules=null; app.newFromPos=false;
    goOnline(id);
  }catch(e){ writeFailed(e); }
  finally{ n.writing=false; render(); }
}
async function startNew(){
  const rules=app.newRules||current().rules;
  if(app.mode==='local'){ setLocal({rules,moves:[],ended:null}); app.panel=null; app.sel=null; app.newRules=null; app.flip=false; toast('New game on this device.'); render(); return; }
  const g=current(), n=app.net;
  app.panel=null; app.sel=null; app.newRules=null;
  if(isClaude()){
    const d=n.doc||{};
    const patch={rules,moves:[],ended:null,drawOffer:null,gameNo:(+d.gameNo||1)+1};
    if(app.newSwap){ patch.white=g.black||null; patch.black=g.white||null; }
    write(patch,'New game started.');
    return;
  }
  // Firebase: open a new game and point this one at it, so the other player follows.
  const was=myColors(g)[0]||'w', side=app.newSwap?opp(was):was;
  if(n.writing) return;
  n.writing=true; render();
  try{ const id=await n.api.rematch(n.gameId,newGameData(rules,side,[])); goOnline(id); toast('New game started. Your opponent’s board follows.'); }
  catch(e){ if(g.next){ goOnline(g.next,{autoClaim:true}); } else writeFailed(e); }
  finally{ n.writing=false; render(); }
}
function share(url,title,text,panelTitle,panelText){
  const show=()=>{ app.panel={kind:'link',url,title:panelTitle,text:panelText}; render(); };
  if(navigator.share&&matchMedia('(pointer: coarse)').matches){
    navigator.share({title,text,url}).catch(err=>{ if(err&&err.name!=='AbortError') show(); });
    return;
  }
  try{ navigator.clipboard.writeText(url).then(()=>{ toast('Link copied. Send it to your opponent.'); render(); },show); }catch(e){ show(); }
}
function act(name,el){
  const v=view(), g=v.g;
  switch(name){
    case 'mode':
      if(el.dataset.v==='online'){ if(app.mode!=='online') goOnline(IN_CLAUDE?'current':(lsGet(LS_LAST)||null)); }
      else { leaveOnline(); app.mode='local'; if(IN_CLAUDE) lsSet(LS_MODE,'local'); app.sel=null; app.panel=null; app.flip=false; syncHash(); render(); }
      break;
    case 'lobby': goOnline(null); break;
    case 'tab': { app.tab=el.dataset.v; render(); const tb=$('tab-'+app.tab); if(tb) tb.focus(); break; }
    case 'flip': app.flip=!app.flip; render(); break;
    case 'new': app.panel={kind:'new'}; app.newRules=g.rules; app.newSwap=true; render(); break;
    case 'new-start': startNew(); break;
    case 'create': createOnline(); break;
    case 'cancel': app.panel=null; render(); break;
    case 'confirm-yes': { const P=app.panel; app.panel=null; if(P&&P.run) P.run(); render(); break; }
    case 'sit': claimSeat(el.dataset.v); break;
    case 'send-link': {
      const url=pageUrl()+hashFor(app.local);
      share(url,'Full Tamerlane Chess',v.result?'Full Tamerlane Chess: the game is over.':`Full Tamerlane Chess: ${CN[v.st.turn]} to move.`,'Send this link','Copy it and send it to your opponent. It holds the whole game.');
      break;
    }
    case 'invite': {
      const url=pageUrl()+'#play='+app.net.gameId;
      share(url,'Full Tamerlane Chess','Play Full Tamerlane Chess with me.','Invite link','Send it to your opponent. Opening it lets them take the open seat.');
      break;
    }
    case 'link-open': { const L=app.pendingLink; if(L){ const r=replay(L.rules,L.moves); openLinked(L,r.st); render(); } break; }
    case 'link-keep': app.pendingLink=null; syncHash(); render(); break;
    case 'leave': {
      const mine=myColors(g), patch={}; if(mine.includes('w')) patch.white=null; if(mine.includes('b')) patch.black=null;
      askConfirm('Leave your seat? Anyone with access can then take it.','Leave seat',()=>write(patch,'You left your seat.'));
      break;
    }
    case 'undo':
      if(app.mode==='local'){ setLocal(app.local.ended?{...app.local,ended:null}:{...app.local,moves:app.local.moves.slice(0,-1)}); app.sel=null; render(); }
      else write({moves:g.moves.slice(0,-1),drawOffer:null},'Move taken back.','takeback');
      break;
    case 'resign': {
      if(app.mode==='local'){ const c=v.st.turn; askConfirm(`${CN[c]} resigns and ${CN[opp(c)]} wins?`,'Resign',()=>{ setLocal({...app.local,ended:{winner:opp(c),reason:'resign'}}); render(); },true); }
      else { const mine=myColors(g); const c=mine.includes(v.st.turn)?v.st.turn:mine[0]; askConfirm('Resign this game?','Resign',()=>write({ended:{reason:'resign',winner:opp(c)},drawOffer:null}),true); }
      break;
    }
    case 'draw-local': askConfirm('Both players agree to a draw?','Agree draw',()=>{ setLocal({...app.local,ended:{winner:null,reason:'agreed'}}); render(); }); break;
    case 'draw-offer': { const mine=myColors(g); const c=mine.includes(v.st.turn)?v.st.turn:mine[0]; write({drawOffer:c},'Draw offered.'); break; }
    case 'draw-accept': write({ended:{reason:'agreed',winner:null},drawOffer:null}); break;
    case 'draw-decline': write({drawOffer:null},g.drawOffer&&myColors(g).includes(g.drawOffer)?'Draw offer withdrawn.':'Draw declined.'); break;
    case 'sheet-cancel': app.sheet=null; render(); break;
    case 'sheet-pick': { const o=app.sheet&&app.sheet.options[+el.dataset.i]; app.sheet=null; if(!o){ render(); break; } if(o.move) play(o.move); else { app.sel=o.select; render(); } break; }
    case 'copy-code': {
      const ta=$('code-out'), txt=gameCode(g);
      const fallback=()=>{ if(ta){ ta.focus(); ta.select(); } toast('Selected. Copy it with your device’s copy command.'); render(); };
      try{ navigator.clipboard.writeText(txt).then(()=>{ toast('Game code copied.'); render(); },fallback); }catch(e){ fallback(); }
      break;
    }
    case 'load-code': {
      const rw=(app.codeDraft||'').trim().split(/\s+/);
      if(rw[0]!=='TC1'||!(rw[1]==='cazaux'||rw[1]==='forbes')){ toast('That is not a game code from this board. Codes start with “TC1”.','warn'); render(); break; }
      const moves=rw.slice(2), r=replay(rw[1],moves,true);
      if(r.applied!==moves.length){ toast(`The code stops making sense at move ${r.applied+1}, so it was not loaded.`,'warn'); render(); break; }
      leaveOnline(); app.mode='local'; if(IN_CLAUDE) lsSet(LS_MODE,'local');
      setLocal({rules:rw[1],moves,ended:null}); app.codeDraft=''; app.sel=null; toast(`Loaded ${moves.length} moves on this device.`); render();
      break;
    }
  }
}
document.addEventListener('click',e=>{
  const sq=e.target.closest('[data-sq]'); if(sq){ onSquare(+sq.dataset.sq); return; }
  const a=e.target.closest('[data-act]'); if(a&&!a.disabled) act(a.dataset.act,a);
});
document.addEventListener('change',e=>{
  if(e.target.name==='rules') app.newRules=e.target.value;
  if(e.target.name==='side') app.newSide=e.target.value;
  if(e.target.id==='swap') app.newSwap=e.target.checked;
  if(e.target.id==='frompos') app.newFromPos=e.target.checked;
});
document.addEventListener('input',e=>{ if(e.target.id==='code-in') app.codeDraft=e.target.value; });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&(app.sheet||app.sel!=null)){ app.sheet=null; app.sel=null; render(); } });

/* ===================== START ===================== */
function claudeBackend(db,me){
  const stamp=()=>new Date().toISOString();
  return {kind:'claude',me,doc(id){
    const r=db.doc('games/'+id);
    return {onSnapshot:(n,e)=>r.onSnapshot(n,e),get:()=>r.get(),update:p=>r.update({...p,updatedAt:stamp()}),set:d=>r.set({...d,updatedAt:stamp()}),acquire:typeof r.acquire==='function'?o=>r.acquire(o):undefined};
  }};
}
async function bootClaude(){
  if(lsGet(LS_MODE)!=='local') app.mode='online';
  app.net.status=app.mode==='online'?'connecting':'off';
  render();
  const cl=window.claude;
  const [db,user]=await Promise.all([cl.use('db').catch(()=>null),cl.use('user').catch(()=>null)]);
  app.user=user;
  if(user){ try{ app.me=await user.id(); app.isOwner=await user.isOwner(); if(await user.can('data.write')===false) app.net.viewOnly=true; }catch(e){} }
  if(!db){ app.net.avail='no'; app.net.status='off'; app.mode='local'; render(); return; }
  const api=claudeBackend(db,app.me);
  app.net.avail='yes'; app.net.connect=async()=>api;
  if(app.mode==='online') goOnline('current'); else render();
}
async function bootHosted(){
  const h=location.hash;
  if(h.indexOf('#play=')===0){ app.mode='online'; app.net.status='connecting'; }
  else adoptHash();
  render();
  window.addEventListener('hashchange',onHashChange);
  // js/online.js reports whether online play is configured; it loads Firebase only when needed.
  const hook=window.tfcOnline;
  const online=hook?await Promise.race([hook.catch(()=>null),new Promise(r=>setTimeout(()=>r(null),8000))]):null;
  if(online&&typeof online.connect==='function'){ app.net.avail='yes'; app.net.connect=online.connect; }
  else app.net.avail='no';
  if(app.mode==='online'){
    if(app.net.avail==='yes') goOnline(h.slice(6));
    else { app.mode='local'; toast('Online play is not set up on this copy of the board.','warn'); syncHash(); render(); }
  } else render();
}
(IN_CLAUDE?bootClaude:bootHosted)();
