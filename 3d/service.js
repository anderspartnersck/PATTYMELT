/* PATTY MELT service desk: reads real engine tickets, never changes the simulation. */
(function(global){
  'use strict';
  const ORDER_PAD='../assets/sprites/ui/order-pad.png', PRINTER='../assets/sprites/ui/receipt-printer.png', TO_GO='../assets/sprites/ui/to-go-receipt.png', BADGE='../assets/sprites/ui/burgerthread-badge.png';
  const LEGACY_KEY='pattymelt.burgertrend.v1';
  const KEY='pattymelt.burgerthread.v1', CAP=200, SEEN_CAP=2048;
  const label=s=>String(s||'').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
  const text=(s,n=140)=>String(s==null?'':s).slice(0,n);
  function valid(r){return r&&typeof r.id==='string'&&r.id.length<180&&typeof r.item==='string'&&Number.isInteger(r.rating)&&r.rating>=1&&r.rating<=5;}
  function createStore(storage){
    let rows=[],seen=[],total=0,sum=0,persistent=!!storage,pending=[],pendingOlderCount=0,pendingOlderSum=0,needsMigration=false;
    function read(){
      const current=storage&&storage.getItem(KEY),legacy=!current&&storage&&storage.getItem(LEGACY_KEY);if(legacy)needsMigration=true;
      const j=JSON.parse(current||legacy||'null');if(!j||!Array.isArray(j.reviews))return null;
      const reviews=j.reviews.filter(valid).slice(-CAP).map(r=>({...r,reasons:(Array.isArray(r.reasons)?r.reasons:[]).filter(x=>typeof x==='string').slice(0,4).map(x=>text(x))}));
      const ids=Array.isArray(j.seen)?j.seen.filter(x=>typeof x==='string').slice(-SEEN_CAP):reviews.map(r=>r.id);
      const recentSum=reviews.reduce((n,r)=>n+r.rating,0),t=j.total;
      const totals=t&&Number.isSafeInteger(t.count)&&t.count>=reviews.length&&Number.isSafeInteger(t.sum)&&t.sum>=recentSum&&t.sum>=t.count&&t.sum<=5*t.count?t:{count:reviews.length,sum:recentSum};
      return {reviews,ids,total:totals.count,sum:totals.sum};
    }
    function refresh(){try{const fresh=read();if(!fresh)return;
      rows=fresh.reviews;seen=fresh.ids;total=fresh.total+pendingOlderCount;sum=fresh.sum+pendingOlderSum;
      pending=pending.filter(r=>!seen.includes(r.id));for(const r of pending){rows.push(r);seen.push(r.id);total++;sum+=r.rating;}
      rows=rows.slice(-CAP);seen=seen.slice(-SEEN_CAP);
    }catch(_){persistent=false;}}
    refresh();
    function save(){if(!storage)return;try{storage.setItem(KEY,JSON.stringify({version:1,reviews:rows,seen,total:{count:total,sum}}));persistent=true;needsMigration=false;pending=[];pendingOlderCount=0;pendingOlderSum=0;}catch(_){persistent=false;}}
    if(needsMigration)save();
    function add(id,event){
      refresh();if(seen.includes(id)||!event||event.type!=='review'||!Number.isInteger(event.rating)||event.rating<1||event.rating>5)return false;
      const r={id:text(id,179),item:text(event.item,60),theme:event.theme==='school'?'school':event.theme==='diner'?'diner':'unspecified',rating:event.rating,outcome:text(event.outcome,30),ageTicks:Math.max(0,Number(event.ageTicks)||0),reasons:Array.isArray(event.reasons)?event.reasons.slice(0,4).map(x=>text(x)):[],at:Date.now()};
      rows.push(r);rows=rows.slice(-CAP);seen.push(r.id);seen=seen.slice(-SEEN_CAP);total++;sum+=r.rating;pending.push(r);if(pending.length>CAP){const old=pending.shift();pendingOlderCount++;pendingOlderSum+=old.rating;}save();return true;
    }
    return {add,refresh,reviews:()=>rows.slice(),persistent:()=>persistent,summary:()=>({count:total,recentCount:rows.length,average:total?sum/total:0}),diagnostics:()=>({pending:pending.length,rows:rows.length,seen:seen.length})};
  }
  function storage(){try{return global.localStorage;}catch(_){return null;}}
  function identity(){try{if(global.crypto&&global.crypto.randomUUID)return global.crypto.randomUUID();}catch(_){}return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);}
  function reviewText(r){let n=0;for(const c of r.id)n=(n*31+c.charCodeAt(0))>>>0;
    const tone=r.rating===5?['Hit every sweet spot. Worth the wait.','Beautifully timed, straight from the pass.','That cook had the rhythm today.']:r.rating>=3?['A solid plate; a little room to tighten the timing.','Lunch arrived. The timing could be sharper.','Good effort from the grill crew.']:['This order missed the mark.','A rough visit to the pass today.','Not the plate I was hoping for.'];
    return tone[n%tone.length]+(r.reasons.length?' '+r.reasons.join(' · '):'');
  }
  function tracker(store){const states=new WeakMap();return {capture(game,context){
    if(!game||!game.service)return 0;
    let state=states.get(game);if(!state){state={prefix:identity(),cursor:0,human:false};states.set(game,state);}
    const ev=game.service.events||[];
    if(context.excluded){state.cursor=ev.length;return 0;}
    if(context.scene==='play')state.human=true;
    let added=0;while(state.cursor<ev.length){const e=ev[state.cursor++];if(state.human&&store.add(state.prefix+':'+e.id,{...e,theme:game.theme}))added++;}return added;
  }};}
  function receiptModel(pm,game){
    if(!game||!game.service||!pm.order_receipts)return [];
    const seconds=n=>(Math.max(0,n||0)/pm.TPS).toFixed(1)+'s';
    return pm.order_receipts(game).map(r=>{
      const action=String(r.nextAction||'WAIT').toUpperCase(),w=r.window||{},cook=r.cookTicks||0;
      let next=label(action),timing='';
      if(r.status==='queued'){next='Wait for a free '+(r.surface||'cooking')+' slot';timing='Queued — no promised deadline';}
      else if(r.status==='ready'){if(/BUN/.test(action)){next='Toast rye on toaster (X); bun joins at the pass';const bun=(game.toaster||[]).find(b=>b&&b.stage===undefined);timing=!bun?'Rye needed — select an empty toaster slot':bun.cook<pm.toast_ready(game)?'Rye toasting · '+seconds(pm.toast_ready(game)-bun.cook)+' to ready':'Rye ready — joins automatically';}else{next='Hey Billy! Send it from the pass';timing='Order up — ready to serve';}}
      else if(['FLIP','CHEESE','ONION','TOAST'].includes(action)&&Number.isFinite(w.idealStart)){
        const perfect=cook>=w.idealStart&&cook<=w.idealEnd;
        timing=perfect?'PERFECT '+action+' NOW':cook<w.idealStart?'Sweet spot in '+seconds(w.idealStart-cook):'Sweet spot passed — finish safely';
        timing+=' · ideal '+seconds(w.idealStart)+'–'+seconds(w.idealEnd)+' cook time';
      }else if(Number.isFinite(r.remainingTicks)&&r.remainingTicks>0)timing='Cooking · '+seconds(r.remainingTicks)+' to next step';
      else timing='Follow the next action; keep Billy at the pass';
      const slot=r.slot==null?'queue':(r.surface||'grill')+' '+(r.slot+1);
      const selected=(game.players||[]).some(p=>r.slot!=null&&((r.surface==='toaster'?game.slots.length:0)+r.slot)===p.cursor);
      return {id:r.id,itemKey:r.item,item:label(r.item),slot,selected,next,timing,age:'Age '+seconds(r.ageTicks),status:label(r.status),recipe:[r.item==='GRILLED_CHEESE'?'Heat bread':'Sear',...(r.recipe||pm.RECIPES[r.item]||[]).map(label),...(pm.TOAST_ITEMS&&pm.TOAST_ITEMS.has(r.item)?['Toast rye separately (X); joins at pass']:[]),'Finish / plate','Billy serves'].join(' → ')};
    });
  }
  // Authored by the user: burger $8, patty melt $9, grilled cheese $7. Other items remain unpriced.
  const MENU_CENTS=Object.freeze({BURGER:800,PATTY_MELT:900,GRILLED_CHEESE:700});
  function itemPrice(item){return Object.prototype.hasOwnProperty.call(MENU_CENTS,item)?MENU_CENTS[item]:null;}
  const money=cents=>cents==null?'—':'$'+(cents/100).toFixed(2);
  function cashModel(game){
    const groups=new Map(),seen=new Set();let count=0,knownCents=0,unknownCount=0;
    for(const e of game&&game.service&&game.service.events||[]){
      if(e.type!=='review'||e.outcome!=='served'||seen.has(e.id))continue;seen.add(e.id);
      const price=itemPrice(e.item);count++;if(price==null)unknownCount++;else knownCents+=price;
      const row=groups.get(e.item)||{item:e.item,quantity:0,unitCents:price};row.quantity++;groups.set(e.item,row);
    }
    return {scope:'current shift',count,lines:[...groups.values()],knownCents,unknownCount,subtotalCents:unknownCount?null:knownCents,taxCents:null,beforeTaxCents:unknownCount?null:knownCents};
  }
  function cashSummary(game){const c=cashModel(game);return 'THIS SHIFT: '+c.count+' served · '+(c.unknownCount?money(c.knownCents)+' priced + '+c.unknownCount+' unpriced · total —':money(c.beforeTaxCents)+' before tax')+' · tax —';}
  function wasteModel(game){const t=game&&game.service&&game.service.waste&&game.service.waste.totals;return t?{pattyBuilds:t.pattyBuilds,breadPortions:t.breadPortions,onionPortions:t.onionPortions,cheeseSlices:t.cheeseSlices}:null;}
  function wasteSummary(game){const t=wasteModel(game);return t?'Waste this shift: '+t.pattyBuilds+' burger builds · '+t.breadPortions+' bread portions · '+t.cheeseSlices+' cheese slices · '+t.onionPortions+' onion portions':'';}
  function paceModel(pm,game){const served=Math.max(0,game&&game.served||0);return served+' served · '+(served?'avg '+((game.wait_sum||0)/served/pm.TPS).toFixed(1)+'s to pass (served orders only)':'no completed-order average yet');}
  function mount({pm,view,pause}){
    const doc=global.document,store=createStore(storage()),track=tracker(store);if(!doc)return {update(){},store};
    const make=(tag,content,cls)=>{const e=doc.createElement(tag);if(content)e.textContent=content;if(cls)e.className=cls;return e;};
    let format=new URLSearchParams(global.location&&global.location.search||'').has('togo')?'togo':'dine-in',controller,lastGame=null,lastContext=null;
    const style=make('style');style.textContent=`
      .pm-service{position:fixed;right:0;top:0;bottom:0;width:280px;box-sizing:border-box;overflow:auto;background:#fff3d5;color:#23160f;border-left:3px dashed #b5352b;padding:12px;font:14px/1.35 system-ui,sans-serif}
      .pm-burgerthread-badge{display:block;width:150px;max-width:100%;height:auto;margin:4px 0}.pm-service .pm-thermal-sheet{position:relative;padding:0;border:0;background:transparent;color:#171717}.pm-thermal-paper{display:block;width:100%;height:auto}.pm-thermal-body{position:absolute;left:7%;right:8%;top:28%;bottom:29%;overflow:auto;font-size:12px;background:rgba(255,255,255,.62);padding:3px}.pm-thermal-body strong,.pm-thermal-body small{display:block}.pm-thermal-value{position:absolute;left:70%;right:7%;text-align:right;font-size:12px;font-weight:bold;color:#111}.pm-thermal-subtotal{top:74.5%}.pm-thermal-tax{top:79%}.pm-thermal-total{top:83.5%}.pm-service[data-format="togo"]>.pm-order-pad-brand{display:none}.pm-receipt-format{display:block;margin:5px 0;font-size:12px}.pm-printer{display:flex;align-items:center;gap:7px;margin:4px 0;font-size:12px}.pm-printer img{display:block;width:60px;height:auto;max-height:47px;object-fit:contain;background:white;border-radius:3px}.pm-printer[data-pulse="a"]{animation:pm-print-a .65s ease-out}.pm-printer[data-pulse="b"]{animation:pm-print-b .65s ease-out}@keyframes pm-print-a{0%{background:#ffd23f;transform:translateY(-2px)}100%{background:transparent;transform:none}}@keyframes pm-print-b{0%{background:#ffd23f;transform:translateY(-2px)}100%{background:transparent;transform:none}}@media(prefers-reduced-motion:reduce){.pm-printer[data-pulse]{animation:none}}
      .pm-order-pad-brand{aspect-ratio:1024/400;background:url("${ORDER_PAD}") center top/100% auto no-repeat;margin:-6px -6px 7px}.pm-service h2{font-size:18px;margin:0 0 8px}.pm-service p{margin:6px 0}.pm-service a{color:#84301d;font-weight:bold}.pm-service article{clear:both;border-top:1px dashed #927259;padding:7px 0}.pm-service .pm-current{border:2px solid #84301d;padding:7px}.pm-service strong{display:block}.pm-service small{display:block}.pm-service summary{cursor:pointer;font-weight:bold;padding:8px 0}.pm-service .pm-perfect{color:#165a25;font-weight:bold}
      body.pm-service-layout #frame,body.pm-service-layout #cab{right:280px}
      body.pm-service-layout #wrap{max-width:calc(100vw - 310px);width:min(calc(100vw - 310px),calc((100dvh - 65px)*var(--pm-screen-aspect,2.13)))}
      body.pm-service-layout #cab.art #cabframe{width:min(calc(100vw - 280px),calc(100dvh * var(--cab-arw,1)/var(--cab-arh,1)));max-width:100%;max-height:100%}
      body.pm-service-layout #bezel{max-width:calc(100vw - 300px)}
      body.pm-service-layout.framed #cab{right:auto;width:min(calc(100vw - 310px),calc(100dvh - 65px))}
      body.pm-service-layout.bare #bezel{width:100%;max-width:100%}
      body.pm-service-layout.bare #cabframe{width:100%;height:100%;max-width:100%;max-height:100%}
      @media(max-width:900px){.pm-printer{font-size:11px;gap:4px}.pm-printer img{width:44px;max-height:34px}.pm-order-pad-brand{float:right;width:130px;height:51px;aspect-ratio:auto;margin:-4px -4px 0 6px}.pm-service{left:0;right:0;top:auto;height:190px;width:auto;border-left:0;border-top:3px dashed #b5352b;padding:8px 12px}.pm-service h2{font-size:15px;margin:0}.pm-service p{margin:3px 0}
      body.pm-service-layout #frame,body.pm-service-layout #cab{right:0;bottom:190px}
      body.pm-service-layout #wrap{max-width:96vw;width:min(96vw,calc((100dvh - 240px)*var(--pm-screen-aspect,2.13)))}
      body.pm-service-layout #cab.art #cabframe{width:min(100vw,calc((100dvh - 190px)*var(--cab-arw,1)/var(--cab-arh,1)));max-height:calc(100dvh - 190px)}
      body.pm-service-layout #bezel{width:min(96vw,calc((100dvh - 205px)*.72));max-width:96vw}
      body.pm-service-layout.bare #cabframe{width:100%;height:100%;max-height:100%}
      body.pm-service-layout.bare #bezel{width:100%;max-width:100%}
      body.pm-service-layout.framed #cab{width:min(96vw,calc(100dvh - 200px));right:auto;bottom:auto}}
    `;doc.head.appendChild(style);doc.body.classList.add('pm-service-layout');
    const screen=doc.getElementById('screen');if(screen)doc.body.style.setProperty('--pm-screen-aspect',String(screen.width/screen.height||2.13));
    const rail=make('aside',null,'pm-service');rail.setAttribute('aria-label','Order receipts and BURGERTHREAD');rail.setAttribute('data-format',format);
    const brand=make('div',null,'pm-order-pad-brand');brand.setAttribute('role','img');brand.setAttribute('aria-label','Patty Melt — Big Grill Energy order pad');rail.appendChild(brand);
    rail.appendChild(make('h2','ORDER UP / RECEIPTS'));
    const printer=make('figure',null,'pm-printer'),printerImage=make('img'),printerCaption=make('figcaption','Printer · awaiting orders');printerImage.src=PRINTER;printerImage.alt='Vintage beige receipt printer';printerImage.decoding='async';printer.appendChild(printerImage);printer.appendChild(printerCaption);printerCaption.setAttribute('role','status');printerCaption.setAttribute('aria-live','polite');rail.appendChild(printer);
    const printed=new WeakMap();let pulse=0;
    const formatLabel=make('label','Receipt format '),formatSelect=make('select');formatSelect.setAttribute('aria-label','Receipt format');formatLabel.className='pm-receipt-format';for(const [value,title]of [['dine-in','Dine-in order pad'],['togo','To-go thermal']]){const option=make('option',title);option.value=value;formatSelect.appendChild(option);}formatSelect.value=format;formatLabel.appendChild(formatSelect);rail.appendChild(formatLabel);formatSelect.addEventListener('change',()=>{format=formatSelect.value==='togo'?'togo':'dine-in';rail.setAttribute('data-format',format);signature='';if(controller&&lastContext)controller.update(lastGame,lastContext);});
    const notice=make('p','Start a shift to open the order rail.');rail.appendChild(notice);
    const progress=make('p');rail.appendChild(progress);const cash=make('p');rail.appendChild(cash);const waste=make('p');waste.className='pm-waste';waste.setAttribute('aria-label','Current shift food waste');waste.title='Double burgers count as one burger build.';rail.appendChild(waste);
    const current=make('div');rail.appendChild(current);
    const queue=make('details'),summary=make('summary','Order queue');queue.appendChild(summary);const list=make('div');queue.appendChild(list);rail.appendChild(queue);
    const reviewsButton=make('button','BURGERTHREAD · customer reviews');reviewsButton.type='button';reviewsButton.setAttribute('aria-expanded','false');reviewsButton.setAttribute('aria-controls','pm-review-panel');rail.appendChild(reviewsButton);const badge=make('img',null,'pm-burgerthread-badge');badge.src=BADGE;badge.alt='BURGERTHREAD';reviewsButton.appendChild(badge);
    const reviewPanel=make('section');reviewPanel.id='pm-review-panel';reviewPanel.hidden=true;reviewPanel.setAttribute('aria-label','Fictional BURGERTHREAD reviews');rail.appendChild(reviewPanel);
    let paintedReviews=-1;
    function paintReviews(){store.refresh();const s=store.summary();paintedReviews=s.count;const head=make('h2','BURGERTHREAD'),brand=make('img',null,'pm-burgerthread-badge'),disclaimer=make('p','Fictional in-game site · local customers only · no online posts.'),score=make('p',s.count?'CUSTOMER RATING: '+s.average.toFixed(1)+' / 5 from '+s.count+' orders · showing latest '+s.recentCount:'No customer reviews yet.');const cards=store.reviews().slice().reverse().map(r=>{const a=make('article');a.appendChild(make('strong',label(r.item)+' · CUSTOMER RATING '+r.rating+' / 5 · '+(r.theme==='school'?'School lunch':r.theme==='diner'?'Diner':'Earlier shift')));a.appendChild(make('p',reviewText(r)));return a;});brand.src=BADGE;brand.alt='BURGERTHREAD';reviewPanel.replaceChildren(head,brand,disclaimer,score,...cards);}
    reviewsButton.addEventListener('click',()=>{reviewPanel.hidden=!reviewPanel.hidden;reviewsButton.setAttribute('aria-expanded',String(!reviewPanel.hidden));if(!reviewPanel.hidden){if(pause)pause(true);paintReviews();live.textContent='Shift paused. Your reviews are open in this page; choose Resume shift when ready.';}});
    const link=make('a','Standalone BURGERTHREAD ↗');link.href='burgerthread.html';link.target='patty-burgerthread';link.rel='noopener';link.setAttribute('aria-label','Open fictional BURGERTHREAD reviews in a separate tab; your shift stays open');link.addEventListener('click',()=>{if(pause)pause(true);live.textContent='Shift paused. Return here and choose Resume shift.';});if(!global.location||global.location.protocol!=='file:')rail.appendChild(link);
    const pauseButton=make('button','Pause shift');pauseButton.type='button';pauseButton.addEventListener('click',()=>{if(pause)pause();});rail.appendChild(pauseButton);
    const rating=make('p','No local customer reviews yet.');rail.appendChild(rating);
    for(const kind of ['keydown','keyup','keypress'])rail.addEventListener(kind,e=>{e.stopPropagation();if(kind==='keydown'&&e.key==='Escape'&&!reviewPanel.hidden){reviewPanel.hidden=true;reviewsButton.setAttribute('aria-expanded','false');reviewsButton.focus();}});
    for(const kind of ['click','pointerdown'])rail.addEventListener(kind,e=>e.stopPropagation());
    const live=make('p');live.setAttribute('role','status');live.setAttribute('aria-live','polite');rail.appendChild(live);doc.body.appendChild(rail);
    let signature='',currentReceipt=null;const receiptScroll=new WeakMap();
    function card(r,thermal=false){
      const a=make('article',null,(r.selected?'pm-current ':'')+(thermal?'pm-thermal-sheet':'')),body=make('div',null,thermal?'pm-thermal-body':'');a.setAttribute('aria-label','Receipt '+r.id+' '+r.item);
      body.appendChild(make('strong','#'+r.id+' · '+r.item+' · '+r.slot+(r.selected?' · SELECTED':'')));body.appendChild(make('small',r.recipe));body.appendChild(make('strong','Next: '+r.next));body.appendChild(make('p',r.timing,r.timing.startsWith('PERFECT')?'pm-perfect':''));body.appendChild(make('small',r.status+' · '+r.age));
      const price=itemPrice(r.itemKey);body.appendChild(make('small',price==null?'Menu price unconfirmed':money(price)+' · item price before tax'));
      if(thermal){currentReceipt={game:lastGame,id:r.id,body};const paper=make('img',null,'pm-thermal-paper');paper.src=TO_GO;paper.alt='Patty Melt to-go receipt';a.appendChild(paper);a.appendChild(body);for(const [kind,value]of [['subtotal',money(price)],['tax','—'],['total',price==null?'—':money(price)+'*']]){const v=make('span',value,'pm-thermal-value pm-thermal-'+kind);v.setAttribute('aria-label',kind+(kind==='total'?' before tax':'')+' '+value);a.appendChild(v);}body.appendChild(make('small','* Total before tax'));}
      else a.appendChild(body);return a;
    }
    return controller={store,finish(game,context){if(game&&game.service&&!context.excluded&&pm.finalize_service){pm.finalize_service(game);track.capture(game,{...context,scene:"play"});}},update(game,context){
      lastGame=game;lastContext=context;
      const added=track.capture(game,context),rows=receiptModel(pm,game),s=store.summary();
      if(game&&game.service&&!context.excluded){const tickets=game.service.tickets||[],latest=tickets.reduce((n,t)=>Math.max(n,Number(t.id)||0),0),seen=printed.get(game)||0;if(latest>seen){printed.set(game,latest);printerCaption.textContent='New ticket #'+latest;printer.setAttribute('data-pulse',++pulse%2?'a':'b');}}
      const first=rows.find(r=>r.selected)||rows[0],sig=JSON.stringify([format,rows,context.scene,context.excluded,s.count,store.persistent(),context.paused,game&&game.served,game&&game.wait_sum,wasteModel(game)]);if(sig===signature)return;signature=sig;
      const show=game&&game.service&&!context.excluded;progress.textContent=show?paceModel(pm,game):'';cash.textContent=show?cashSummary(game):'';waste.textContent=show?wasteSummary(game):'';pauseButton.disabled=context.scene!=='play';pauseButton.textContent=context.paused?'Resume shift':'Pause shift';
      notice.textContent=!show?'Practice / attract / battle — no public reviews.':rows.length?'Pace: one arrival / '+((game.cfg.drop_interval||0)/pm.TPS).toFixed(1)+'s · real cook windows, no customer deadline.':'Waiting for the next real order.';
      if(currentReceipt){let saved=receiptScroll.get(currentReceipt.game);if(!saved){saved=new Map();receiptScroll.set(currentReceipt.game,saved);}saved.set(currentReceipt.id,currentReceipt.body.scrollTop||0);}currentReceipt=null;
      current.replaceChildren(...(show&&first?[card(first,format==='togo')]:[]));if(currentReceipt)currentReceipt.body.scrollTop=receiptScroll.get(currentReceipt.game)?.get(currentReceipt.id)||0;list.replaceChildren(...(show?rows.filter(r=>r!==first).map(r=>card(r)):[]));summary.textContent='Order queue · '+(show?rows.length:0)+' active';
      rating.textContent=s.count?'CUSTOMER RATING: '+s.average.toFixed(1)+' / 5 · '+s.count+' local customer ratings'+(store.persistent()?'':' · storage unavailable; this tab only'):'No local customer reviews yet.'+(store.persistent()?'':' Storage unavailable; this tab only.');
      if(!reviewPanel.hidden&&s.count!==paintedReviews)paintReviews();
      if(added)live.textContent=added+' customer rating'+(added===1?'':'s')+' added to BURGERTHREAD.';
    }};
  }
  const api={KEY,LEGACY_KEY,CAP,createStore,tracker,receiptModel,reviewText,paceModel,wasteModel,wasteSummary,MENU_CENTS,itemPrice,money,cashModel,cashSummary,mount,label};global.PMService=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
