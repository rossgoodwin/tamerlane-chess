/* Full Tamerlane Chess — rules engine (no UI).
   Board: 11 files (a–k) × 10 ranks, squares 0–109 as y*11+x, plus two citadels:
   110 = White's own citadel (beside k2), 111 = Black's own citadel (beside a9). */
'use strict';
const FILES='abcdefghijk';
const WC=110, BC=111;
const X=s=>s%11, Y=s=>(s/11)|0, SQ=(x,y)=>y*11+x;
const onB=(x,y)=>x>=0&&x<11&&y>=0&&y<10;
const opp=c=>c==='w'?'b':'w';
const ownCit=c=>c==='w'?WC:BC, enemyCit=c=>c==='w'?BC:WC;
const CIT_ADJ={[WC]:[SQ(10,0),SQ(10,1),SQ(10,2)],[BC]:[SQ(0,7),SQ(0,8),SQ(0,9)]};
const ROYAL={K:3,PR:2,AK:1};

function nm(s){ if(s===WC) return 'cw'; if(s===BC) return 'cb'; return FILES[X(s)]+(Y(s)+1); }
function parseSq(t){ if(t==='cw') return WC; if(t==='cb') return BC; const m=/^([a-k])(10|[1-9])$/.exec(t||''); return m?SQ(FILES.indexOf(m[1]),+m[2]-1):-1; }
function leaps(a,b){ const seen=new Set(), out=[]; for(const [p,q] of [[a,b],[b,a]]) for(const sx of [1,-1]) for(const sy of [1,-1]){ const dx=p*sx||0, dy=q*sy||0, k=dx+','+dy; if(!seen.has(k)){ seen.add(k); out.push([dx,dy]); } } return out; }
const LK=leaps(1,1).concat(leaps(1,0)), LF=leaps(1,1), LV=leaps(1,0), LN=leaps(1,2), LE=leaps(2,2), LC=leaps(1,3), LW=leaps(2,0), L30=leaps(3,0), L32=leaps(3,2), L33=leaps(3,3);
const ORTH=[[1,0],[-1,0],[0,1],[0,-1]], DIAG=[[1,1],[1,-1],[-1,1],[-1,-1]];

/* Setup from MS 7322 as given by Wikipedia ("Great chess", full array). Piece codes:
   K king, PR prince, AK adventitious king, F general, S sea monster, G giraffe, T picket,
   N knight, R rook, E elephant, C camel, W war engine, L lion, B bull, X revealer, P pawn. */
function initialBoard(){
  const b=new Array(112).fill(null);
  const r1='E L N B W X W B C L E'.split(' ');
  const r2='R N T G F K S G T N R'.split(' ');
  const r3='P N C W F K S G T L R'.split(' ');
  for(let x=0;x<11;x++){
    b[SQ(x,0)]={t:r1[x],c:'w'}; b[SQ(x,1)]={t:r2[x],c:'w'}; b[SQ(x,2)]={t:'P',of:r3[x],c:'w',st:0};
    b[SQ(10-x,9)]={t:r1[x],c:'b'}; b[SQ(10-x,8)]={t:r2[x],c:'b'}; b[SQ(10-x,7)]={t:'P',of:r3[x],c:'b',st:0};
  }
  // 4th row: White c4/f4/i4; Black mirrors by reflection so the pawns of bulls face each other.
  for(const [x,o] of [[2,'B'],[5,'X'],[8,'E']]){ b[SQ(x,3)]={t:'P',of:o,c:'w',st:0}; b[SQ(x,6)]={t:'P',of:o,c:'b',st:0}; }
  return b;
}
const immune=o=>o.t==='P'&&o.of==='P'&&o.st===1;
function highestRoyal(b,c){ let best=null,r=0; for(let s=0;s<112;s++){ const p=b[s]; if(p&&p.c===c&&ROYAL[p.t]>r){ r=ROYAL[p.t]; best=p.t; } } return best; }
function royalsOf(b,c){ const out=[]; for(let s=0;s<112;s++){ const p=b[s]; if(p&&p.c===c&&ROYAL[p.t]) out.push(s); } return out; }

// Destination squares (moves and captures) for the piece p standing on s, ignoring royal safety.
function targets(b,s,p,rules,out){
  const c=p.c;
  const add=d=>{ const o=b[d]; if(!o){ out.push(d); return; } if(o.c!==c&&!immune(o)) out.push(d); };
  const leap=list=>{ const x=X(s),y=Y(s); for(const [dx,dy] of list){ const nx=x+dx,ny=y+dy; if(onB(nx,ny)) add(SQ(nx,ny)); } };
  const ride=(x0,y0,dx,dy,min)=>{ for(let k=1;;k++){ const nx=x0+dx*k, ny=y0+dy*k; if(!onB(nx,ny)) break; const d=SQ(nx,ny), o=b[d]; if(k<min){ if(o) break; continue; } if(!o){ out.push(d); continue; } if(o.c!==c&&!immune(o)) out.push(d); break; } };
  const slide=(dirs,min)=>{ const x=X(s),y=Y(s); for(const [dx,dy] of dirs) ride(x,y,dx,dy,min||1); };
  const giraffe=()=>{ const x=X(s),y=Y(s); for(const [dx,dy] of DIAG){ const x1=x+dx,y1=y+dy; if(!onB(x1,y1)||b[SQ(x1,y1)]) continue; ride(x1,y1,dx,0,3); ride(x1,y1,0,dy,3); } };
  const royal=()=>{
    if(s>=110){ for(const d of CIT_ADJ[s]) add(d); return; }
    leap(LK);
    for(const cit of [WC,BC]){
      if(b[cit]||!CIT_ADJ[cit].includes(s)) continue;
      if(cit===enemyCit(c)&&highestRoyal(b,c)===p.t) out.push(cit);
      else if(cit===ownCit(c)&&p.t==='AK') out.push(cit);
    }
  };
  if(s>=110&&!ROYAL[p.t]) return;
  const forbes=rules==='forbes';
  switch(p.t){
    case 'K': case 'PR': case 'AK': royal(); break;
    case 'F': leap(LF); break;
    case 'S': leap(LV); break;
    case 'G': giraffe(); break;
    case 'T': slide(DIAG,2); break;
    case 'N': leap(LN); break;
    case 'R': slide(ORTH); break;
    case 'E': leap(LE); break;
    case 'C': leap(LC); break;
    case 'W': leap(LW); break;
    case 'L': if(forbes){ slide(ORTH); giraffe(); } else leap(L30); break;
    case 'B': if(forbes){ slide(DIAG); giraffe(); } else leap(L32); break;
    case 'X': if(forbes){ slide(DIAG); slide(ORTH); } else leap(L33); break;
    case 'P': {
      if(p.of==='P'&&p.st===1) break;
      const dir=c==='w'?1:-1, x=X(s), ny=Y(s)+dir;
      if(ny<0||ny>9) break;
      if(!b[SQ(x,ny)]) out.push(SQ(x,ny));
      for(const dx of [-1,1]){ const nx=x+dx; if(nx<0||nx>10) continue; const o=b[SQ(nx,ny)]; if(o&&o.c!==c&&!immune(o)) out.push(SQ(nx,ny)); }
      break;
    }
  }
}
function isAttacked(b,t,by,rules){
  if(t>=110) return false;
  const tmp=[];
  for(let s=0;s<112;s++){ const p=b[s]; if(!p||p.c!==by) continue; tmp.length=0; targets(b,s,p,rules,tmp); if(tmp.includes(t)) return true; }
  return false;
}
function nearestEmpty(b,y,x0){ for(let d=1;d<=10;d++) for(const x of [x0-d,x0+d]) if(x>=0&&x<=10&&!b[SQ(x,y)]) return SQ(x,y); return -1; }

function newGame(rules){ return {board:initialBoard(),turn:'w',flags:{w:{swap:false,cit:false},b:{swap:false,cit:false}},rules,result:null,ply:0,last:null,cap:null,note:null}; }

// Apply a move with no legality check. Records captures, promotions and citadel draws.
function applyRaw(st,m){
  const b=st.board.slice(), c=st.turn, p=b[m.f];
  const flags={w:{...st.flags.w},b:{...st.flags.b}};
  let result=null, cap=null, note=null, land=m.t;
  if(m.k==='m'){
    cap=b[m.t]; b[m.f]=null;
    let np=p, reloc=-1;
    if(p.t==='P'&&m.t<110&&Y(m.t)===(c==='w'?9:0)){
      if(p.of==='P'){
        const stage=p.st||0;
        if(stage===0){ np={...p,st:1}; note='park'; }
        else if(stage===2){
          const ry=c==='w'?2:7, home=SQ(5,ry);
          reloc=b[home]?nearestEmpty(b,ry,5):home;
          if(reloc>=0){ np=null; note='return'; land=reloc; } else { np={...p,st:1}; note='park'; }
        } else { np={t:'AK',c}; note='promote'; }
      } else { np={t:p.of==='K'?'PR':p.of,c}; note='promote'; }
    }
    b[m.t]=np;
    if(reloc>=0) b[reloc]={...p,st:3};
    if(ROYAL[p.t]&&m.t===enemyCit(c)) result={winner:null,reason:'citadel',by:c};
  } else if(m.k==='ks'){ const q=b[m.t]; b[m.t]=p; b[m.f]=q; flags[c].swap=true; }
  else if(m.k==='d'){ cap=b[m.t]; b[m.f]=null; b[m.t]={...p,st:2}; }
  else if(m.k==='cs'){ const q=b[m.x]; b[m.f]=null; b[m.x]=p; b[m.t]=q; flags[c].cit=true; land=m.x; }
  return {board:b,turn:opp(c),flags,rules:st.rules,result,ply:st.ply+1,last:{f:m.f,t:land,k:m.k},cap,note};
}
function safeAfter(st,m){
  const ns=applyRaw(st,m);
  if(ns.result) return true;
  const rs=royalsOf(ns.board,st.turn);
  if(rs.length!==1) return rs.length>1;
  return !isAttacked(ns.board,rs[0],opp(st.turn),st.rules);
}
function pieceCanMove(st,s){ const tmp=[]; targets(st.board,s,st.board[s],st.rules,tmp); for(const d of tmp) if(safeAfter(st,{k:'m',f:s,t:d})) return true; return false; }

// Pawn of pawns parked on the last rank: may be placed where it forks two enemy pieces,
// or where it attacks a piece that has no legal move (this board's reading of "cannot escape").
function dropMoves(st,s,moves){
  const b=st.board, c=st.turn, o=opp(c), dir=c==='w'?1:-1, last=c==='w'?9:0;
  for(let d=0;d<110;d++){
    if(d===s||Y(d)===last) continue;
    const occ=b[d]; if(occ&&(ROYAL[occ.t]||immune(occ))) continue;
    const ny=Y(d)+dir; if(ny<0||ny>9) continue;
    const hit=[];
    for(const dx of [-1,1]){ const nx=X(d)+dx; if(nx<0||nx>10) continue; const q=b[SQ(nx,ny)]; if(q&&q.c===o&&!immune(q)) hit.push(SQ(nx,ny)); }
    if(hit.length>=2){ moves.push({k:'d',f:s,t:d}); continue; }
    if(hit.length===1){
      const nb=b.slice(); nb[s]=null; nb[d]={...b[s],st:2};
      if(!pieceCanMove({...st,board:nb,turn:o},hit[0])) moves.push({k:'d',f:s,t:d});
    }
  }
}
function genPseudo(st){
  const b=st.board, c=st.turn, moves=[], tmp=[];
  for(let s=0;s<112;s++){
    const p=b[s]; if(!p||p.c!==c) continue;
    if(immune(p)){ dropMoves(st,s,moves); continue; }
    tmp.length=0; targets(b,s,p,st.rules,tmp);
    for(const d of tmp){
      moves.push({k:'m',f:s,t:d});
      if(p.t==='K'&&d===enemyCit(c)&&!st.flags[c].cit)
        for(let r=0;r<110;r++){ const q=b[r]; if(q&&q.c===c&&(q.t==='PR'||q.t==='AK')) moves.push({k:'cs',f:s,t:d,x:r}); }
    }
  }
  return moves;
}
function inCheck(st){ const rs=royalsOf(st.board,st.turn); return rs.length===1&&isAttacked(st.board,rs[0],opp(st.turn),st.rules)?rs[0]:-1; }
function legalMoves(st){
  if(st.result) return [];
  const c=st.turn, b=st.board;
  const moves=genPseudo(st).filter(m=>safeAfter(st,m));
  const chk=inCheck(st)>=0;
  if(!st.flags[c].swap&&(chk||moves.length===0)){
    let k=-1; for(let s=0;s<110;s++){ const p=b[s]; if(p&&p.c===c&&p.t==='K'){ k=s; break; } }
    if(k>=0) for(let s=0;s<110;s++){
      const q=b[s]; if(!q||q.c!==c||s===k||ROYAL[q.t]||immune(q)) continue;
      if(q.t==='P'&&Y(k)===(c==='w'?9:0)) continue;
      const m={k:'ks',f:k,t:s}; if(safeAfter(st,m)) moves.push(m);
    }
  }
  return moves;
}

/* Move codes: e3-e4 · f2~h2 (king's escape swap) · a10>e5 (pawn of pawns placed) · a9-cb!d5 (citadel swap) */
function encode(m){ const a=nm(m.f), t=nm(m.t); if(m.k==='ks') return a+'~'+t; if(m.k==='d') return a+'>'+t; if(m.k==='cs') return a+'-'+t+'!'+nm(m.x); return a+'-'+t; }
function decode(code){
  const r=/^([a-k](?:10|[1-9])|c[wb])([-~>])([a-k](?:10|[1-9])|c[wb])(?:!([a-k](?:10|[1-9])))?$/.exec(code||'');
  if(!r) return null;
  const f=parseSq(r[1]), t=parseSq(r[3]);
  if(r[4]) return {k:'cs',f,t,x:parseSq(r[4])};
  return {k:r[2]==='~'?'ks':r[2]==='>'?'d':'m',f,t};
}

/* ---------- names and text ---------- */
const GL={K:'K',PR:'Pr',AK:'AK',F:'F',S:'S',G:'G',T:'T',N:'N',R:'R',E:'E',C:'C',W:'W',L:'L',B:'B',X:'Rv'};
const NAME={K:['King','Shāh'],PR:['Prince','Shāhzāda'],AK:['Adventitious king','Shāh maṣnūʿ'],F:['General','Firzān'],S:['Sea monster','Luxm'],G:['Giraffe','Zurāfa'],T:['Picket','Ṭalīʿa'],N:['Knight','Faras'],R:['Rook','Rukh'],E:['Elephant','Pīl'],C:['Camel','Jamal'],W:['War engine','Dabbāba'],L:['Lion','Asad'],B:['Bull','Thaur'],X:['Revealer','Kashshāf'],P:['Pawn','Baidaq']};
const PL={K:'kings',P:'pawns',F:'generals',S:'sea monsters',G:'giraffes',T:'pickets',N:'knights',R:'rooks',E:'elephants',C:'camels',W:'war engines',L:'lions',B:'bulls',X:'revealers'};
const CN={w:'White',b:'Black'};
const art=w=>(/^[aeiou]/i.test(w)?'an ':'a ')+w;
// Pawns wear a small copy of their piece's icon; the pawn of pawns wears a pawn.
const iconKey=p=>p.t==='P'?p.of:p.t;
const glyph=p=>p.t==='P'?(p.of==='K'?'k':p.of==='P'?'p':GL[p.of].toLowerCase()):GL[p.t];
function pieceName(p){ return p.t==='P'?'pawn of '+PL[p.of]:NAME[p.t][0].toLowerCase(); }
function promotesTo(of){ return of==='K'?'a prince':art(NAME[of][0].toLowerCase()); }

const DESC={
  K:'One square in any direction. Once per game, when it is in check or you have no other move, it may trade places with any of your other non-royal pieces.',
  PR:'Moves like the king. A pawn of kings becomes a prince on the last rank. While you have more than one royal piece, each can be captured like any other piece and you may leave them attacked.',
  AK:'Moves like the king. It is the third promotion of the pawn of pawns, and the only piece allowed into its own citadel, where it cannot be captured.',
  F:'One square diagonally.',
  S:'One square orthogonally, like the vizier it replaces in this array. Both reconstructions agree on this.',
  G:'Steps one square diagonally, then runs straight outward at least three squares. It cannot jump: every square it crosses must be empty.',
  T:'Moves like a modern bishop but must travel at least two squares. It cannot jump the first square.',
  N:'Leaps like a modern knight: two squares one way, one square the other.',
  R:'Moves like a modern rook.',
  E:'Leaps exactly two squares diagonally, over anything in between.',
  C:'Leaps three squares one way and one square the other: a stretched knight.',
  W:'Leaps exactly two squares orthogonally, over anything in between.',
};
const DESC_X={
  cazaux:{L:'Leaps exactly three squares orthogonally.',B:'Leaps three squares one way and two the other.',X:'Leaps exactly three squares diagonally.'},
  forbes:{L:'Moves as a rook or as a giraffe.',B:'Moves as a bishop of any distance or as a giraffe.',X:'Moves as a rook or as a bishop: a modern queen.'}
};
const RULESET={cazaux:['Cazaux (2012)','The lion, bull and revealer are simple leapers that fill out a 7×7 square of moves.'],forbes:['Forbes (1860)','The lion, bull and revealer combine the rook, bishop and giraffe moves; the revealer is a modern queen.']};
function describe(t,rules){ return DESC[t]||DESC_X[rules][t]||''; }
const PAWN_DESC='Steps one square forward and captures one square diagonally forward. No double step and no en passant.';
const POP_STAGE=[
  'Has not reached the last rank yet. The first time it does, it parks there.',
  'Parked on the last rank and cannot be captured. On your turn it may be placed on any square where it would fork two enemy pieces or attack one that has no legal move. Whatever stands on that square is removed (never a royal piece).',
  'Back in play after being placed. When it next reaches the last rank it reappears on the pawn-of-kings square (f3 for White, f8 for Black).',
  'On its third run. When it reaches the last rank again it becomes an adventitious king.'
];

function notation(st,m,ns){
  const b=st.board, p=b[m.f];
  if(m.k==='ks') return 'K'+nm(m.f)+'⇄'+glyph(b[m.t])+nm(m.t);
  if(m.k==='d') return 'p'+nm(m.f)+'⇒'+nm(m.t)+(b[m.t]?' ×'+glyph(b[m.t]):'');
  if(m.k==='cs') return 'K'+nm(m.f)+'–⌂ ⇄'+GL[b[m.x].t]+nm(m.x);
  let s=(p.t==='P'?'':GL[p.t])+nm(m.f)+(b[m.t]?'×':'–')+(m.t>=110?'⌂':nm(m.t));
  if(ns.note==='promote') s+='='+GL[ns.board[m.t].t];
  else if(ns.note==='park') s+=' parks';
  else if(ns.note==='return') s+=' →'+nm(ns.last.t);
  if(ns.result&&ns.result.reason==='citadel') s+=' ½';
  return s;
}

// Rebuild a game from its move codes. With strict, every move must be legal.
// base (an earlier result for a prefix of codes, same rules) lets a long game continue
// from where it was instead of starting over.
function replay(rules,codes,strict,base){
  let st=newGame(rules), log=[], caps={w:[],b:[]}, start=0;
  if(base&&base.st.rules===rules&&base.applied<=codes.length){ st=base.st; log=base.log.slice(); caps={w:base.caps.w.slice(),b:base.caps.b.slice()}; start=base.applied; }
  for(let i=start;i<codes.length;i++){
    const code=codes[i], m=decode(code);
    if(!m||m.f<0||m.t<0||!st.board[m.f]||st.board[m.f].c!==st.turn||st.result) break;
    if(strict&&!legalMoves(st).some(x=>encode(x)===code)) break;
    if(m.k==='cs'&&(m.x<0||!st.board[m.x])) break;
    if(m.k==='ks'&&!st.board[m.t]) break;
    const before=st; st=applyRaw(st,m);
    if(st.cap&&st.cap.c!==before.turn) caps[before.turn].push(st.cap);
    let txt=notation(before,m,st);
    if(!st.result&&inCheck(st)>=0) txt+='+';
    log.push(txt);
  }
  return {st,log,caps,applied:log.length};
}
