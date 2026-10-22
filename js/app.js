/* Full Tamerlane Chess — board UI.
   Hosted on its own (e.g. GitHub Pages): play on one device, or by link, where the page
   address carries the whole game. Opened as a Claude artifact: also a live shared game. */
'use strict';
const IN_CLAUDE=!!(window.claude&&typeof window.claude.use==='function');
const LINK_OK=!IN_CLAUDE;

/* ===================== STATE ===================== */
const LS_LOCAL='tfc.local.v1', LS_MODE='tfc.mode.v1';
const lsGet=k=>{ try{ return localStorage.getItem(k); }catch(e){ return null; } };
const lsSet=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
function loadLocal(){
  try{ const o=JSON.parse(lsGet(LS_LOCAL)||'null'); if(o&&Array.isArray(o.moves)) return {rules:o.rules==='forbes'?'forbes':'cazaux',moves:o.moves.filter(x=>typeof x==='string'),ended:o.ended||null}; }catch(e){}
  return {rules:'cazaux',moves:[],ended:null};
}

const app={
  mode:IN_CLAUDE&&lsGet(LS_MODE)!=='local'?'shared':'local',
  local:loadLocal(),
  shared:{status:IN_CLAUDE?'connecting':'unavailable',doc:null,ref:null,readOnly:false},
  me:null,user:null,isOwner:false,
  sel:null,flip:false,panel:null,sheet:null,tab:'pieces',pendingLink:null,
  toast:'',toastKind:'',codeDraft:'',newRules:null,newSwap:false,
};
function setLocal(next){ app.local=next; lsSet(LS_LOCAL,JSON.stringify(next)); syncHash(); }

function current(){
  if(app.mode==='local') return {rules:app.local.rules,moves:app.local.moves,ended:app.local.ended,drawOffer:null,white:null,black:null};
  const d=app.shared.doc;
  if(!d) return {rules:'cazaux',moves:[],ended:null,drawOffer:null,white:null,black:null,empty:true};
  return {rules:d.rules==='forbes'?'forbes':'cazaux',moves:Array.isArray(d.moves)?d.moves.filter(x=>typeof x==='string'):[],ended:d.ended&&typeof d.ended==='object'?d.ended:null,drawOffer:d.drawOffer==='w'||d.drawOffer==='b'?d.drawOffer:null,white:d.white||null,black:d.black||null};
}
let memoKey=null, memo=null;
function view(){
  const g=current();
  const key=g.rules+'|'+g.moves.join(' ');
  if(key!==memoKey){
    const r=replay(g.rules,g.moves);
    let st=r.st; const legal=legalMoves(st); const chkSq=st.result?-1:inCheck(st);
    if(!st.result&&legal.length===0){
      st={...st,result:{winner:opp(st.turn),reason:chkSq>=0?'checkmate':'stalemate'}};
      if(r.log.length) r.log[r.log.length-1]=r.log[r.log.length-1].replace(/\+$/,'')+'#';
    }
    memo={...r,st,legal,chk:chkSq};
    memoKey=key;
  }
  return {...memo,g,result:g.ended||memo.st.result};
}
function myColors(g){
  if(app.mode==='local') return ['w','b'];
  const out=[]; if(app.me&&g.white===app.me) out.push('w'); if(app.me&&g.black===app.me) out.push('b'); return out;
}
function canMoveNow(v){
  if(v.result) return false;
  if(app.mode==='local') return true;
  if(!app.shared.doc||app.shared.readOnly) return false;
  return myColors(v.g).includes(v.st.turn);
}
function flipped(v){
  if(app.mode==='local') return app.flip;
  const mine=myColors(v.g); return mine.length===1&&mine[0]==='b'?!app.flip:app.flip;
}

/* ===================== LINKS (hosted only) ===================== */
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
function syncHash(){
  if(!LINK_OK) return;
  const h=hashFor(app.local);
  if(location.hash!==h){ try{ history.replaceState(null,'',h); }catch(e){ location.hash=h; } }
}
const isPrefix=(a,b)=>a.length<=b.length&&a.every((x,i)=>x===b[i]);
function adoptHash(){
  if(!LINK_OK) return;
  if(!location.hash||location.hash.indexOf('#g=')!==0){ syncHash(); return; }
  const h=parseHash(location.hash);
  if(!h){ toast('That link does not hold a game this board can read.','warn'); syncHash(); render(); return; }
  const r=replay(h.rules,h.moves,true);
  if(r.applied!==h.moves.length){ toast(`The linked game has an illegal move at move ${r.applied+1}, so it was not opened.`,'warn'); syncHash(); render(); return; }
  const cur=app.local, same=cur.rules===h.rules;
  if(same&&cur.moves.length===h.moves.length&&isPrefix(cur.moves,h.moves)&&JSON.stringify(cur.ended)===JSON.stringify(h.ended)) return;
  if((!cur.moves.length&&!cur.ended)||(same&&isPrefix(cur.moves,h.moves)&&!cur.ended)){ openLinked(h,r.st); return; }
  app.pendingLink={...h,turn:r.st.turn};
  render();
}
function openLinked(h,st){
  app.pendingLink=null; app.sel=null; app.mode='local';
  setLocal({rules:h.rules,moves:h.moves,ended:h.ended});
  app.flip=!st.result&&st.turn==='b';
  const v=view();
  toast(v.result?'Opened the finished game from the link.':`Opened the game from the link. ${CN[v.st.turn]} to move.`);
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
  const plyKey=v.g.rules+'|'+v.g.moves.length, animate=lastDrawnPly!==null&&lastDrawnPly!==plyKey;
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
function renderStrip(el,c,v){
  const g=v.g, over=!!v.result, turn=!over&&v.st.turn===c;
  const caps=v.caps[c].map(p=>tok(p,'mini')).join('');
  let who='';
  if(app.mode==='local'){ who=`<span class="chip ${c}"></span><span class="pname">${CN[c]}</span>`; }
  else {
    const uid=c==='w'?g.white:g.black;
    if(uid){ who=`<span class="chip ${c}"></span><img class="avatar" alt="" data-avatar="${uid}" hidden><span class="pname" data-uid="${uid}">${CN[c]}</span>`; }
    else if(app.shared.doc&&app.me&&!app.shared.readOnly){ who=`<span class="chip ${c}"></span><span class="pname">${CN[c]}</span><button class="btn small" data-act="sit" data-v="${c}">Sit here</button>`; }
    else { who=`<span class="chip ${c}"></span><span class="pname">${CN[c]}</span><span class="small">${app.shared.doc?'seat open':''}</span>`; }
  }
  el.innerHTML=`<div class="who">${who}${turn?'<span class="tomove">to move</span>':''}</div><div class="caps" aria-label="Pieces captured by ${CN[c]}">${caps}</div>`;
}
function statusText(v){
  if(app.mode==='shared'){
    if(app.shared.status==='connecting') return 'Loading the shared game…';
    if(app.shared.status==='error') return 'The shared game could not be loaded';
    if(!app.shared.doc) return 'No shared game yet';
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
  let s=`${CN[st.turn]} to move`;
  if(app.mode==='shared'){
    const g=v.g, mine=myColors(g), seat=st.turn==='w'?g.white:g.black;
    if(!seat) s=`${CN[st.turn]} to move · seat open`;
    else if(mine.includes(st.turn)&&!app.shared.readOnly) s='Your move';
    else if(mine.length) s=`Waiting for ${CN[st.turn]}`;
  }
  return s;
}
function renderActions(v){
  const a=[], over=!!v.result, g=v.g;
  if(app.mode==='local'){
    if(LINK_OK) a.push(`<button class="btn primary" data-act="send-link">Send link</button>`);
    a.push(`<button class="btn" data-act="undo" ${g.moves.length||g.ended?'':'disabled'}>Undo</button>`);
    a.push(`<button class="btn" data-act="flip">Flip board</button>`);
    if(!over){ a.push(`<button class="btn" data-act="draw-local">Agree a draw</button>`); a.push(`<button class="btn danger" data-act="resign">${CN[v.st.turn]} resigns</button>`); }
    a.push(`<button class="btn ${LINK_OK?'':'primary'}" data-act="new">New game</button>`);
  } else if(app.shared.doc){
    const mine=myColors(g), can=!app.shared.readOnly&&mine.length>0;
    const lastMover=g.moves.length?(g.moves.length%2===1?'w':'b'):null;
    if(can&&!over&&lastMover&&mine.includes(lastMover)) a.push(`<button class="btn" data-act="undo">Take back my move</button>`);
    a.push(`<button class="btn" data-act="flip">Flip board</button>`);
    if(can&&!over){
      const myC=mine.includes(v.st.turn)?v.st.turn:mine[0];
      if(g.drawOffer&&g.drawOffer!==myC){ a.push(`<button class="btn primary" data-act="draw-accept">Accept draw</button>`); a.push(`<button class="btn" data-act="draw-decline">Decline draw</button>`); }
      else if(g.drawOffer===myC) a.push(`<button class="btn" disabled>Draw offered</button>`);
      else a.push(`<button class="btn" data-act="draw-offer">Offer a draw</button>`);
      a.push(`<button class="btn danger" data-act="resign">Resign</button>`);
    }
    if(!app.shared.readOnly&&(mine.length||app.isOwner)) a.push(`<button class="btn ${over?'primary':''}" data-act="new">New game</button>`);
    if(can) a.push(`<button class="btn" data-act="leave">Leave my seat</button>`);
  }
  $('actions').innerHTML=a.join('');
}
function renderPanel(){
  const el=$('panel'), P=app.panel;
  const needCreate=app.mode==='shared'&&app.shared.status==='ready'&&!app.shared.doc;
  if(!P&&!needCreate){ el.innerHTML=''; return; }
  if(P&&P.kind==='confirm'){
    el.innerHTML=`<div class="card"><p>${P.text}</p><div class="row"><button class="btn ${P.danger?'danger':'primary'}" data-act="confirm-yes">${P.label}</button><button class="btn" data-act="cancel">Cancel</button></div></div>`;
    return;
  }
  if(P&&P.kind==='link'){
    el.innerHTML=`<div class="card"><h3>Send this link</h3><p>Copy it and send it to your opponent. It holds the whole game.</p><input class="linkfield" id="link-out" readonly value="${escapeHTML(P.url)}" aria-label="Game link"><div class="row"><button class="btn" data-act="cancel">Done</button></div></div>`;
    const f=$('link-out'); if(f){ f.focus(); f.select(); }
    return;
  }
  const isNew=P&&P.kind==='new';
  if(needCreate&&(app.shared.readOnly||!app.me)){
    el.innerHTML=`<div class="card"><h3>No game on this board yet</h3><p>The owner of this page starts the shared game. Once it exists you can follow it here.</p></div>`;
    return;
  }
  const rules=app.newRules||current().rules||'cazaux';
  const opts=['cazaux','forbes'].map(k=>`<label class="choice"><input type="radio" name="rules" id="rules-${k}" value="${k}" ${rules===k?'checked':''}><div><b>${RULESET[k][0]}</b><span>${RULESET[k][1]}</span></div></label>`).join('');
  const g=current();
  const swap=app.mode==='shared'&&!needCreate&&(g.white||g.black)?`<label class="choice"><input type="checkbox" id="swap" ${app.newSwap?'checked':''}><div><b>Swap colours</b><span>White and Black trade seats for the next game.</span></div></label>`:'';
  const title=needCreate?'Start a shared game':'New game';
  const lead=needCreate?'You will sit as White. Your friend opens this page and takes the Black seat.':'The manuscript shows where the lion, bull and revealer stand, but not how they move. Pick a reconstruction for this game.';
  el.innerHTML=`<div class="card"><h3>${title}</h3><p>${lead}</p><div class="choices">${opts}${swap}</div><div class="row"><button class="btn primary" data-act="${needCreate?'create':'new-start'}">${needCreate?'Start game':'Start new game'}</button>${isNew?'<button class="btn" data-act="cancel">Cancel</button>':''}</div></div>`;
}
function renderInfo(v){
  const el=$('info'), s=app.sel, p=s!=null?v.st.board[s]:null, rules=v.g.rules;
  if(!p){
    el.innerHTML=`<div class="info"><div><h2>Tap a piece</h2><p>Its name and move appear here, with its reachable squares on the board. Tap an opponent's piece to see what it threatens.</p><div class="meta">${RULESET[rules][0].toUpperCase()} RECONSTRUCTION · ${v.g.moves.length} PLY</div></div></div>`;
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
    const code=gameCode(v.g);
    const online=LINK_OK?`
<h4>Play by link</h4>
<ol><li>Make your move.</li>
<li>Tap <b>Send link</b> and send it to your opponent by text or email.</li>
<li>They open it, see your move, reply, and send a link back.</li></ol>
<p>The link holds the whole game, so the newest link is the game. Anyone with a link can move either side, so send it only to your opponent.</p>
<h4>Over the board</h4>
<p>Pass the phone. The game stays in this browser and in the page address.</p>`:`
<h4>Play online</h4>
<p>Use <b>Shared game</b> at the top. Both players see the same board and moves arrive live, so you can play in one sitting or a move a day.</p>
<ul><li>Share this page with your friend from the share menu and invite them by email as an <b>Editor</b>. Viewers and people arriving by a public link can watch but cannot move.</li>
<li>Avoid turning on a public link as well: an outside Editor loses the ability to move while the page is also shared by link.</li>
<li>Each of you taps <b>Sit here</b> on a side. Black's board turns around automatically.</li></ul>
<h4>Over the board</h4>
<p>Choose <b>This device</b> and pass the phone. The game is kept in this browser.</p>`;
    el.innerHTML=`${online}
<h4>Game code</h4>
<p class="small">The whole game as text, for keeping a copy or moving it to another device.</p>
<textarea id="code-out" readonly aria-label="Current game code">${escapeHTML(code)}</textarea>
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
  if(IN_CLAUDE){
    const shareOK=app.shared.status!=='unavailable';
    $('modes').innerHTML=`<button data-act="mode" data-v="shared" aria-pressed="${app.mode==='shared'}" ${shareOK?'':'disabled title="Shared play is not available in this view"'}>Shared game</button><button data-act="mode" data-v="local" aria-pressed="${app.mode==='local'}">This device</button>`;
  } else $('modes').innerHTML='';
  $('rulesline').innerHTML=`Extra pieces: <b>${RULESET[v.g.rules][0]}</b> reading`;
  let ban='';
  const L=app.pendingLink;
  if(L){
    ban=`<div class="banner"><b>This link holds a different game</b> from the one on this device (${L.moves.length} move${L.moves.length===1?'':'s'}, ${L.ended?'finished':CN[L.turn]+' to move'}).<div class="row"><button class="btn primary" data-act="link-open">Open the linked game</button><button class="btn" data-act="link-keep">Keep this device's game</button></div></div>`;
  } else if(app.mode==='shared'){
    if(app.shared.status==='error') ban=`<div class="banner warn">The shared game could not be loaded in this view. You can still play on this device.</div>`;
    else if(app.shared.doc&&app.shared.readOnly) ban=`<div class="banner">You are watching. To move pieces, ask the owner of this page to invite you by email as an Editor.</div>`;
    else if(app.shared.doc&&!app.me) ban=`<div class="banner">Sign in to take a seat. You can still watch the game.</div>`;
  } else if(IN_CLAUDE&&app.shared.status==='unavailable'){
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
  if(!v.result&&v.chk>=0&&!(app.mode==='shared'&&!app.shared.doc)){ const c=document.createElement('span'); c.className='chk'; c.textContent=' · Check'; st.appendChild(c); }
  renderActions(v);
  const t=$('toast'); t.textContent=app.toast; t.className='toast'+(app.toastKind?' '+app.toastKind:'');
  renderPanel(); renderInfo(v); renderTabs(v); renderSheet();
  fillNames(v);
}
function escapeHTML(s){ return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
async function fillNames(v){
  if(app.mode!=='shared'||!app.user) return;
  const ids=[v.g.white,v.g.black].filter(Boolean); if(!ids.length) return;
  let ps; try{ ps=await app.user.profiles(ids); }catch(e){ return; }
  document.querySelectorAll('[data-uid]').forEach(n=>{ const p=ps[n.dataset.uid]; if(p) n.textContent=(p.name||n.textContent||'Player')+(p.isMe?' (you)':''); });
  document.querySelectorAll('[data-avatar]').forEach(n=>{ const p=ps[n.dataset.avatar]; if(p&&p.avatarUrl){ n.src=p.avatarUrl; n.hidden=false; } });
}
let toastTimer=null;
function toast(msg,kind){ app.toast=msg; app.toastKind=kind||''; clearTimeout(toastTimer); if(msg&&kind!=='warn') toastTimer=setTimeout(()=>{ app.toast=''; render(); },4000); }

/* ===================== ACTIONS ===================== */
function gameCode(g){ return ['TC1',g.rules].concat(g.moves).join(' '); }
async function write(patch,ok){
  const ref=app.shared.ref; if(!ref) return false;
  if(app.shared.writing){ toast('Still saving the last change.'); render(); return false; }
  app.shared.writing=true;
  try{ await ref.update({...patch,updatedAt:new Date().toISOString()}); if(ok) toast(ok); return true; }
  catch(e){ writeFailed(e); return false; }
  finally{ app.shared.writing=false; render(); }
}
function writeFailed(e){
  const code=e&&e.code;
  if(code==='invalid_argument'||code==='not_granted'){ app.shared.readOnly=true; toast('Your move was not saved: this page is view-only for you. The owner can invite you by email as an Editor.','warn'); }
  else if(code==='revoked'){ app.shared.readOnly=true; toast('Your access to this page changed, so the board is read-only now.','warn'); }
  else if(code==='quota_exceeded'){ toast('The shared game store is full, so nothing more can be saved.','warn'); }
  else toast('That change was not saved. Check your connection and try again.','warn');
}
function play(m){
  const v=view(), code=encode(m);
  app.sel=null; app.sheet=null;
  if(app.mode==='local'){ setLocal({...app.local,moves:[...app.local.moves,code],ended:null}); render(); return; }
  write({moves:[...v.g.moves,code],drawOffer:null});
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

async function claimSeat(c){
  const ref=app.shared.ref, key=c==='w'?'white':'black';
  if(!ref||!app.me) return;
  try{
    if(typeof ref.acquire==='function'){
      const r=await ref.acquire({holder:app.me,ttlMs:5000});
      if(!r.acquired){ toast('Someone else is taking a seat right now. Try again in a few seconds.'); render(); return; }
    }
    const snap=await ref.get(); const d=snap.exists?snap.data():null;
    if(!d){ toast('The game was reset. Try again.'); render(); return; }
    if(d[key]){ toast(`The ${CN[c]} seat was just taken.`); render(); return; }
    await write({[key]:app.me},`You are playing ${CN[c]}.`);
  }catch(e){ writeFailed(e); render(); }
}
async function createShared(){
  const ref=app.shared.ref; if(!ref) return;
  const rules=app.newRules||'cazaux';
  try{ await ref.set({v:1,rules,white:app.me||null,black:null,moves:[],ended:null,drawOffer:null,gameNo:1,updatedAt:new Date().toISOString()}); toast('Game started. Share this page with your friend.'); }
  catch(e){ writeFailed(e); }
  app.panel=null; app.newRules=null; render();
}
function startNew(){
  const rules=app.newRules||current().rules;
  if(app.mode==='local'){ setLocal({rules,moves:[],ended:null}); app.panel=null; app.sel=null; app.newRules=null; app.flip=false; toast('New game on this device.'); render(); return; }
  const g=current(), d=app.shared.doc||{};
  const patch={rules,moves:[],ended:null,drawOffer:null,gameNo:(+d.gameNo||1)+1};
  if(app.newSwap){ patch.white=g.black||null; patch.black=g.white||null; }
  app.panel=null; app.sel=null; app.newRules=null; app.newSwap=false;
  write(patch,'New game started.');
}
function sendLink(v){
  const url=location.href.split('#')[0]+hashFor(app.local);
  const text=v.result?'Full Tamerlane Chess: the game is over.':`Full Tamerlane Chess: ${CN[v.st.turn]} to move.`;
  if(navigator.share){
    navigator.share({title:'Full Tamerlane Chess',text,url}).catch(err=>{ if(err&&err.name!=='AbortError'){ app.panel={kind:'link',url}; render(); } });
    return;
  }
  const show=()=>{ app.panel={kind:'link',url}; render(); };
  try{ navigator.clipboard.writeText(url).then(()=>{ toast('Link copied. Send it to your opponent.'); render(); },show); }catch(e){ show(); }
}
function act(name,el){
  const v=view(), g=v.g;
  switch(name){
    case 'mode': app.mode=el.dataset.v; lsSet(LS_MODE,app.mode); app.sel=null; app.panel=null; app.flip=false; render(); break;
    case 'tab': { app.tab=el.dataset.v; render(); const tb=$('tab-'+app.tab); if(tb) tb.focus(); break; }
    case 'flip': app.flip=!app.flip; render(); break;
    case 'new': app.panel={kind:'new'}; app.newRules=g.rules; render(); break;
    case 'new-start': startNew(); break;
    case 'create': createShared(); break;
    case 'cancel': app.panel=null; render(); break;
    case 'confirm-yes': { const P=app.panel; app.panel=null; if(P&&P.run) P.run(); render(); break; }
    case 'sit': claimSeat(el.dataset.v); break;
    case 'send-link': sendLink(v); break;
    case 'link-open': { const L=app.pendingLink; if(L){ const r=replay(L.rules,L.moves); openLinked(L,r.st); } break; }
    case 'link-keep': app.pendingLink=null; syncHash(); render(); break;
    case 'leave': {
      const mine=myColors(g), patch={}; if(mine.includes('w')) patch.white=null; if(mine.includes('b')) patch.black=null;
      askConfirm('Leave your seat? Anyone with access can then take it.','Leave seat',()=>write(patch,'You left your seat.'));
      break;
    }
    case 'undo':
      if(app.mode==='local'){ setLocal(app.local.ended?{...app.local,ended:null}:{...app.local,moves:app.local.moves.slice(0,-1)}); app.sel=null; render(); }
      else write({moves:g.moves.slice(0,-1),drawOffer:null},'Move taken back.');
      break;
    case 'resign': {
      if(app.mode==='local'){ const c=v.st.turn; askConfirm(`${CN[c]} resigns and ${CN[opp(c)]} wins?`,'Resign',()=>{ setLocal({...app.local,ended:{winner:opp(c),reason:'resign'}}); render(); },true); }
      else { const mine=myColors(g); const c=mine.includes(v.st.turn)?v.st.turn:mine[0]; askConfirm('Resign this game?','Resign',()=>write({ended:{winner:opp(c),reason:'resign'},drawOffer:null}),true); }
      break;
    }
    case 'draw-local': askConfirm('Both players agree to a draw?','Agree draw',()=>{ setLocal({...app.local,ended:{winner:null,reason:'agreed'}}); render(); }); break;
    case 'draw-offer': { const mine=myColors(g); const c=mine.includes(v.st.turn)?v.st.turn:mine[0]; write({drawOffer:c},'Draw offered.'); break; }
    case 'draw-accept': write({ended:{winner:null,reason:'agreed'},drawOffer:null}); break;
    case 'draw-decline': write({drawOffer:null},'Draw declined.'); break;
    case 'sheet-cancel': app.sheet=null; render(); break;
    case 'sheet-pick': { const o=app.sheet&&app.sheet.options[+el.dataset.i]; app.sheet=null; if(!o){ render(); break; } if(o.move) play(o.move); else { app.sel=o.select; render(); } break; }
    case 'copy-code': {
      const ta=$('code-out'), txt=gameCode(g);
      const fallback=()=>{ if(ta){ ta.focus(); ta.select(); } toast('Selected. Copy it with your device’s copy command.'); render(); };
      try{ navigator.clipboard.writeText(txt).then(()=>{ toast('Game code copied.'); render(); },fallback); }catch(e){ fallback(); }
      break;
    }
    case 'load-code': {
      const raw=(app.codeDraft||'').trim().split(/\s+/);
      if(raw[0]!=='TC1'||!(raw[1]==='cazaux'||raw[1]==='forbes')){ toast('That is not a game code from this board. Codes start with “TC1”.','warn'); render(); break; }
      const moves=raw.slice(2), r=replay(raw[1],moves,true);
      if(r.applied!==moves.length){ toast(`The code stops making sense at move ${r.applied+1}, so it was not loaded.`,'warn'); render(); break; }
      app.mode='local'; lsSet(LS_MODE,'local'); setLocal({rules:raw[1],moves,ended:null}); app.codeDraft=''; app.sel=null; toast(`Loaded ${moves.length} moves on this device.`); render();
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
  if(e.target.id==='swap') app.newSwap=e.target.checked;
});
document.addEventListener('input',e=>{ if(e.target.id==='code-in') app.codeDraft=e.target.value; });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&(app.sheet||app.sel!=null)){ app.sheet=null; app.sel=null; render(); } });

/* ===================== START ===================== */
async function boot(){
  if(!IN_CLAUDE){
    adoptHash();
    window.addEventListener('hashchange',()=>{ adoptHash(); render(); });
    render();
    return;
  }
  render();
  const cl=window.claude;
  const [db,user]=await Promise.all([cl.use('db').catch(()=>null),cl.use('user').catch(()=>null)]);
  app.user=user;
  if(user){
    try{ app.me=await user.id(); app.isOwner=await user.isOwner(); if(await user.can('data.write')===false) app.shared.readOnly=true; }catch(e){}
  }
  if(!db){ app.shared.status='unavailable'; app.mode='local'; render(); return; }
  const ref=db.doc('games/current'); app.shared.ref=ref;
  ref.onSnapshot(snap=>{
    const prev=app.shared.doc;
    app.shared.status='ready';
    app.shared.doc=snap.exists?snap.data():null;
    if(prev&&app.shared.doc&&prev.moves&&app.shared.doc.moves&&prev.moves.length!==app.shared.doc.moves.length) app.sel=null;
    render();
  },err=>{ app.shared.status=err&&err.code==='revoked'?'unavailable':'error'; render(); });
}
boot();
