(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const config = window.APP_CONFIG || {};
  const configured = config.SUPABASE_URL && config.SUPABASE_ANON_KEY &&
    !config.SUPABASE_URL.includes("PASTE_") && !config.SUPABASE_ANON_KEY.includes("PASTE_");
  let supabase = null, currentUser = null, isRegistering = false;
  let bills = [], funds = [], fundTx = [], debts = [], debtTx = [];
  let dialogContext = null, confirmCallback = null;

  const money = (n) => new Intl.NumberFormat("ms-MY", {style:"currency",currency:"MYR"}).format(Number(n || 0));
  const today = () => new Date().toISOString().slice(0,10);
  const monthNow = () => today().slice(0,7);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const setMessage = (id, text, error=false) => { const el=$(id); el.textContent=text||""; el.classList.toggle("error",!!error); };
  const show = (id, yes=true) => $(id).classList.toggle("hidden", !yes);
  const val = id => $(id).value;
  const setVal = (id,v) => { $(id).value = v ?? ""; };

  function init() {
    setVal("dashboardMonth", monthNow()); setVal("billMonth", monthNow());
    if (!configured || !window.supabase) {
      show("setupNotice", true);
      $("authTitle").textContent = "Konfigurasi diperlukan";
      setMessage("authMessage", "Lengkapkan app-config.js dan jalankan SQL setup sebelum menggunakan aplikasi.", true);
      $("authSubmit").disabled = true;
      return;
    }
    supabase = window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    $("authForm").addEventListener("submit", handleAuth);
    $("toggleAuth").addEventListener("click", () => {
      isRegistering = !isRegistering;
      $("authTitle").textContent = isRegistering ? "Daftar akaun" : "Log masuk";
      $("authSubmit").textContent = isRegistering ? "Daftar" : "Log masuk";
      $("toggleAuth").textContent = isRegistering ? "Sudah ada akaun? Log masuk" : "Belum ada akaun? Daftar";
      $("password").autocomplete = isRegistering ? "new-password" : "current-password";
      setMessage("authMessage", "");
    });
    $("signOutBtn").addEventListener("click", async () => { await supabase.auth.signOut(); });
    supabase.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      renderAuthState();
      if (currentUser) setTimeout(loadAll, 0);
    });
    $("dashboardMonth").addEventListener("change", renderDashboard);
    $("billMonth").addEventListener("change", renderBills);
    $("billCategoryFilter").addEventListener("change", renderBills);
    $("debtTypeFilter").addEventListener("change", renderDebts);
    document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
    document.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.go)));
    $("addBillBtn").addEventListener("click", () => openBillForm());
    $("addFundBtn").addEventListener("click", () => openFundForm());
    $("addDebtBtn").addEventListener("click", () => openDebtForm());
    $("backupBtn").addEventListener("click", backupData);
    $("restoreBtn").addEventListener("click", () => $("restoreFile").click());
    $("restoreFile").addEventListener("change", restoreData);
    $("closeDialog").addEventListener("click", closeItemDialog);
    $("cancelDialog").addEventListener("click", closeItemDialog);
    $("itemForm").addEventListener("submit", saveDialog);
    $("confirmAction").addEventListener("click", e => { if (confirmCallback) { e.preventDefault(); const cb=confirmCallback; confirmCallback=null; $("confirmDialog").close(); cb(); } });
    supabase.auth.getSession().then(({data}) => { currentUser=data.session?.user || null; renderAuthState(); if(currentUser) loadAll(); });
  }

  async function handleAuth(e) {
    e.preventDefault(); setMessage("authMessage", "Sedang diproses…");
    const email=val("email").trim(), password=val("password");
    const result = isRegistering
      ? await supabase.auth.signUp({email,password})
      : await supabase.auth.signInWithPassword({email,password});
    if (result.error) { setMessage("authMessage", result.error.message, true); return; }
    if (isRegistering && !result.data.session) setMessage("authMessage", "Pendaftaran diterima. Semak email untuk pengesahan, kemudian log masuk.");
    else setMessage("authMessage", "Berjaya.");
  }

  function renderAuthState() {
    show("authView", !currentUser); show("appView", !!currentUser); show("signOutBtn", !!currentUser);
    if(currentUser) $("userEmail").textContent = currentUser.email || "Akaun pengguna";
  }

  async function db(table) {
    const {data,error}=await supabase.from(table).select("*").order("created_at",{ascending:false});
    if(error) throw error; return data || [];
  }
  async function loadAll() {
    try {
      setMessage("globalMessage","Memuatkan rekod…");
      [bills,funds,fundTx,debts,debtTx]=await Promise.all([
        db("bills"),db("funds"),db("fund_transactions"),db("debts"),db("debt_transactions")
      ]);
      renderAll(); setMessage("globalMessage","");
    } catch(e) { setMessage("globalMessage","Gagal memuatkan data: "+e.message,true); }
  }
  function renderAll(){renderDashboard();renderBills();renderFunds();renderDebts();}
  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    ["dashboard","bills","funds","debts"].forEach(t=>show("tab-"+t,t===tab));
    if(tab==="dashboard")renderDashboard(); if(tab==="bills")renderBills(); if(tab==="funds")renderFunds(); if(tab==="debts")renderDebts();
  }

  function renderDashboard() {
    const m=val("dashboardMonth")||monthNow(), list=bills.filter(b=>String(b.bill_month||"").slice(0,7)===m);
    const total=list.reduce((s,b)=>s+Number(b.amount||0),0), paid=list.filter(b=>b.is_paid).reduce((s,b)=>s+Number(b.amount||0),0);
    $("statTotal").textContent=money(total); $("statPaid").textContent=money(paid); $("statUnpaid").textContent=money(total-paid);
    const owe=debts.filter(d=>d.debt_type==="owe").reduce((s,d)=>s+remainingDebt(d),0);
    const owed=debts.filter(d=>d.debt_type==="owed").reduce((s,d)=>s+remainingDebt(d),0);
    $("statDebt").textContent=money(owe-owed);
    $("dashboardBills").innerHTML=list.length?list.sort((a,b)=>(a.due_date||"").localeCompare(b.due_date||"")).map(b=>`<div class="record-top" style="padding:10px 0;border-bottom:1px solid var(--line)"><div><strong>${esc(b.name)}</strong><div class="record-meta">${esc(b.category)} · Tarikh akhir ${esc(b.due_date||"—")}</div></div><div style="text-align:right"><strong>${money(b.amount)}</strong><div><span class="pill ${b.is_paid?"":"unpaid"}">${b.is_paid?"Dibayar":"Belum bayar"}</span></div></div></div>`).join(""):'<div class="empty-state">Tiada bil untuk bulan ini.</div>';
    renderCategoryChart(list);
    renderMonthComparison(m, total);
  }

  function renderCategoryChart(list) {
    const el=$("categoryChart");
    if(!list.length){el.innerHTML='<div class="empty-state">Tiada data bil untuk bulan ini.</div>';return;}
    const groups={}; list.forEach(b=>{const k=b.category||"Lain-lain";groups[k]=(groups[k]||0)+Number(b.amount||0);});
    const rows=Object.entries(groups).sort((a,b)=>b[1]-a[1]);
    const max=rows[0]?.[1]||1;
    el.innerHTML=rows.map(([name,amount],i)=>`<div class="category-row"><div class="category-label"><span>${esc(name)}</span><strong>${money(amount)}</strong></div><div class="bar-track"><span class="category-bar bar-${i%5}" style="width:${Math.max(3,amount/max*100)}%"></span></div></div>`).join("");
  }
  function renderMonthComparison(month,total) {
    const el=$("monthCompare");
    const [year,mon]=month.split("-").map(Number);
    const previousDate=new Date(year,mon-2,1);
    const previousKey=`${previousDate.getFullYear()}-${String(previousDate.getMonth()+1).padStart(2,"0")}`;
    const previousLabel=previousDate.toLocaleDateString("ms-MY",{month:"long",year:"numeric"});
    const currentLabel=new Date(year,mon-1,1).toLocaleDateString("ms-MY",{month:"long",year:"numeric"});
    const previousTotal=bills.filter(b=>String(b.bill_month||"").slice(0,7)===previousKey).reduce((s,b)=>s+Number(b.amount||0),0);
    const max=Math.max(total,previousTotal,1),diff=total-previousTotal;
    const pct=previousTotal?Math.abs(diff)/previousTotal*100:null;
    const trend=diff===0?"Tiada perubahan":diff>0?`Naik ${pct.toFixed(1)}% berbanding bulan lepas`:`Turun ${pct.toFixed(1)}% berbanding bulan lepas`;
    el.innerHTML=`<div class="compare-total"><span>Jumlah bulan ini</span><strong>${money(total)}</strong><small class="${diff>0?"trend-up":diff<0?"trend-down":"trend-flat"}">${previousTotal?trend:"Belum ada rekod bulan lepas untuk perbandingan."}</small></div><div class="compare-bars"><div class="compare-item"><div class="compare-caption"><span>${esc(previousLabel)}</span><strong>${money(previousTotal)}</strong></div><div class="bar-track"><span class="compare-bar previous-bar" style="width:${previousTotal/max*100}%"></span></div></div><div class="compare-item"><div class="compare-caption"><span>${esc(currentLabel)}</span><strong>${money(total)}</strong></div><div class="bar-track"><span class="compare-bar current-bar" style="width:${total/max*100}%"></span></div></div></div><p class="compare-note">Perbandingan berdasarkan bil yang direkodkan dalam aplikasi.</p>`;
  }

  function renderBills() {
    const m=val("billMonth")||monthNow(), cat=val("billCategoryFilter");
    const list=bills.filter(b=>String(b.bill_month||"").slice(0,7)===m&&(!cat||b.category===cat)).sort((a,b)=>(a.due_date||"").localeCompare(b.due_date||""));
    $("billsList").innerHTML=list.length?list.map(b=>`<article class="record-card"><div class="record-top"><div><h3>${esc(b.name)}</h3><div class="record-meta">${esc(b.category)} · ${esc(b.bill_month||"")}</div></div><span class="pill ${b.is_paid?"":"unpaid"}">${b.is_paid?"Sudah bayar":"Belum bayar"}</span></div><div class="amount">${money(b.amount)}</div><div class="record-meta">Tarikh akhir: ${esc(b.due_date||"—")}${b.notes?" · "+esc(b.notes):""}</div><div class="record-actions"><button class="btn ${b.is_paid?"btn-outline":"btn-primary"}" data-action="toggle-bill" data-id="${b.id}">${b.is_paid?"Tanda belum bayar":"Tanda sudah bayar"}</button><button class="btn btn-outline" data-action="edit-bill" data-id="${b.id}">Edit</button><button class="btn btn-outline" data-action="delete-bill" data-id="${b.id}">Padam</button></div></article>`).join(""):'<div class="empty-state">Tiada bil untuk pilihan ini. Tekan “Tambah bil” untuk mula.</div>';
    $("billsList").querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>billAction(b.dataset.action,b.dataset.id)));
  }
  function renderFunds() {
    $("fundsList").innerHTML=funds.length?funds.map(f=>{
      const current=Number(f.current_amount||0), target=Number(f.target_amount||0), pct=target>0?Math.min(100,current/target*100):0;
      const history=fundTx.filter(t=>t.fund_id===f.id).sort((a,b)=>(b.transaction_date||"").localeCompare(a.transaction_date||"")).slice(0,3);
      return `<article class="record-card"><div class="record-top"><div><h3>${esc(f.name)}</h3><div class="record-meta">Sasaran: ${money(target)} · Perlu sebelum ${esc(f.target_date||"—")}</div></div><span class="pill">${Math.round(pct)}%</span></div><div class="amount">${money(current)} <span class="record-meta">/ ${money(target)}</span></div><div class="progress"><span style="width:${pct}%"></span></div><div class="record-meta">${esc(f.notes||"Tiada catatan")}</div><div class="record-actions"><button class="btn btn-primary" data-action="fund-add" data-id="${f.id}">+ Simpanan</button><button class="btn btn-outline" data-action="fund-withdraw" data-id="${f.id}">Pengeluaran</button><button class="btn btn-outline" data-action="edit-fund" data-id="${f.id}">Edit</button><button class="btn btn-outline" data-action="fund-history" data-id="${f.id}">Sejarah</button><button class="btn btn-outline" data-action="delete-fund" data-id="${f.id}">Padam</button></div>${history.length?`<div class="record-meta" style="margin-top:12px">Transaksi terkini: ${history.map(t=>`${esc(t.transaction_date)} ${t.transaction_type==="deposit"?"+":"−"}${money(t.amount)}`).join(" · ")}</div>`:""}</article>`;
    }).join(""):'<div class="empty-state">Belum ada tabung. Tambah tabung untuk sasaran simpanan tahunan atau berkala.</div>';
    $("fundsList").querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>fundAction(b.dataset.action,b.dataset.id)));
  }
  function remainingDebt(d){return Math.max(0,Number(d.original_amount||0)-Number(d.settled_amount||0));}
  function renderDebts() {
    const type=val("debtTypeFilter"), list=debts.filter(d=>!type||d.debt_type===type);
    $("debtsList").innerHTML=list.length?list.map(d=>{
      const remain=remainingDebt(d), history=debtTx.filter(t=>t.debt_id===d.id).sort((a,b)=>(b.transaction_date||"").localeCompare(a.transaction_date||"")).slice(0,2);
      return `<article class="record-card"><div class="record-top"><div><h3>${esc(d.person_name)}</h3><div class="record-meta">${esc(d.description||"Tiada keterangan")}</div></div><span class="pill ${remain>0?"unpaid":""}">${d.debt_type==="owe"?"Saya perlu bayar":"Orang perlu bayar saya"}</span></div><div class="amount">${money(remain)} <span class="record-meta">baki</span></div><div class="record-meta">Asal: ${money(d.original_amount)} · Sudah dibayar/dikutip: ${money(d.settled_amount)} · Tarikh: ${esc(d.due_date||"—")}</div><div class="progress"><span style="width:${Number(d.original_amount)>0?Math.min(100,Number(d.settled_amount)/Number(d.original_amount)*100):0}%"></span></div><div class="record-actions"><button class="btn btn-primary" data-action="debt-pay" data-id="${d.id}">${d.debt_type==="owe"?"Rekod bayaran":"Rekod kutipan"}</button><button class="btn btn-outline" data-action="edit-debt" data-id="${d.id}">Edit</button><button class="btn btn-outline" data-action="debt-history" data-id="${d.id}">Sejarah</button><button class="btn btn-outline" data-action="delete-debt" data-id="${d.id}">Padam</button></div>${history.length?`<div class="record-meta" style="margin-top:12px">Transaksi terkini: ${history.map(t=>`${esc(t.transaction_date)} ${money(t.amount)}`).join(" · ")}</div>`:""}</article>`;
    }).join(""):'<div class="empty-state">Tiada rekod hutang.</div>';
    $("debtsList").querySelectorAll("[data-action]").forEach(b=>b.addEventListener("click",()=>debtAction(b.dataset.action,b.dataset.id)));
  }

  function field(name,label,type="text",value="",opts=null,required=true,full=false) {
    const id="f_"+name; let control="";
    if(type==="select") control=`<select id="${id}" name="${name}" ${required?"required":""}>${opts.map(o=>`<option value="${esc(o.value)}" ${String(value)===String(o.value)?"selected":""}>${esc(o.label)}</option>`).join("")}</select>`;
    else control=`<input id="${id}" name="${name}" type="${type}" value="${esc(value)}" ${type==="number"?'min="0" step="0.01"':""} ${required?"required":""} ${type==="text"&&name==="notes"?"maxlength=\"1000\"":""}>`;
    return `<div class="field ${full?"full":""}"><label for="${id}">${label}</label>${control}</div>`;
  }
  const categories=[{value:"Utiliti",label:"Utiliti"},{value:"Insurans",label:"Insurans"},{value:"Yuran",label:"Yuran"},{value:"Pinjaman",label:"Pinjaman"},{value:"Langganan",label:"Langganan"},{value:"Lain-lain",label:"Lain-lain"}];
  function openDialog(title,fields,ctx){dialogContext=ctx;$("dialogTitle").textContent=title;$("dialogFields").innerHTML=fields.join("");setMessage("dialogMessage","");$("itemDialog").showModal();}
  function closeItemDialog(){if($("itemDialog").open)$("itemDialog").close();dialogContext=null;}
  function formData(){const o={};new FormData($("itemForm")).forEach((v,k)=>{if(k)o[k]=v;});return o;}
  function openBillForm(b=null){openDialog(b?"Edit bil":"Tambah bil",[
    field("name","Nama bil","text",b?.name||"",null,true,true),
    field("category","Kategori","select",b?.category||"Utiliti",categories),
    field("amount","Amaun (RM)","number",b?.amount??"",null,true),
    field("bill_month","Bulan bil","month",b?.bill_month||val("billMonth")||monthNow()),
    field("due_date","Tarikh akhir","date",b?.due_date||today(),null,false),
    field("is_paid","Status","select",String(!!b?.is_paid),[{value:"false",label:"Belum bayar"},{value:"true",label:"Sudah bayar"}]),
    field("notes","Catatan","text",b?.notes||"",null,false,true)
  ],{kind:"bill",id:b?.id});}
  function openFundForm(f=null){openDialog(f?"Edit tabung":"Tambah tabung",[
    field("name","Nama tabung","text",f?.name||"",null,true,true),
    field("target_amount","Sasaran (RM)","number",f?.target_amount??"",null,true),
    field("target_date","Tarikh sasaran","date",f?.target_date||"",null,false),
    field("current_amount","Simpanan semasa (RM)","number",f?.current_amount??"0",null,true),
    field("notes","Catatan","text",f?.notes||"",null,false,true)
  ],{kind:"fund",id:f?.id,original:f});}
  function openDebtForm(d=null){openDialog(d?"Edit hutang":"Tambah hutang",[
    field("debt_type","Jenis hutang","select",d?.debt_type||"owe",[{value:"owe",label:"Saya perlu bayar"},{value:"owed",label:"Orang berhutang dengan saya"}]),
    field("person_name","Nama orang / pihak","text",d?.person_name||"",null,true,true),
    field("description","Keterangan","text",d?.description||"",null,false,true),
    field("original_amount","Jumlah asal (RM)","number",d?.original_amount??"",null,true),
    field("settled_amount","Jumlah sudah dibayar/dikutip (RM)","number",d?.settled_amount??"0",null,true),
    field("due_date","Tarikh perlu selesai","date",d?.due_date||"",null,false)
  ],{kind:"debt",id:d?.id,original:d});}
  async function saveDialog(e) {
    e.preventDefault(); if(!dialogContext)return; const data=formData(), ctx=dialogContext;
    try {
      if(ctx.kind==="bill") {
        const row={name:data.name.trim(),category:data.category,amount:Number(data.amount),bill_month:data.bill_month,due_date:data.due_date||null,is_paid:data.is_paid==="true",notes:data.notes||null};
        await saveRow("bills",ctx.id,row);
      } else if(ctx.kind==="fund") {
        const current=Number(data.current_amount||0), old=ctx.original?Number(ctx.original.current_amount||0):0;
        const row={name:data.name.trim(),target_amount:Number(data.target_amount),target_date:data.target_date||null,current_amount:current,notes:data.notes||null};
        if(ctx.id) await saveRow("funds",ctx.id,row); else { const inserted=await insertRow("funds",row); if(current>0) await insertRow("fund_transactions",{fund_id:inserted.id,transaction_type:"deposit",amount:current,transaction_date:today(),notes:"Simpanan awal"}); }
        if(ctx.id && current!==old) { const delta=current-old; await insertRow("fund_transactions",{fund_id:ctx.id,transaction_type:delta>0?"deposit":"withdrawal",amount:Math.abs(delta),transaction_date:today(),notes:"Pelarasan melalui edit tabung"}); }
      } else if(ctx.kind==="debt") {
        const row={debt_type:data.debt_type,person_name:data.person_name.trim(),description:data.description||null,original_amount:Number(data.original_amount),settled_amount:Number(data.settled_amount||0),due_date:data.due_date||null};
        if(row.settled_amount>row.original_amount) throw new Error("Jumlah sudah dibayar/dikutip tidak boleh melebihi jumlah asal.");
        if(ctx.id) await saveRow("debts",ctx.id,row); else { const inserted=await insertRow("debts",row); if(row.settled_amount>0) await insertRow("debt_transactions",{debt_id:inserted.id,amount:row.settled_amount,transaction_date:today(),notes:"Jumlah awal yang sudah diselesaikan"}); }
      }
      closeItemDialog(); await loadAll(); setMessage("globalMessage","Rekod berjaya disimpan.");
    } catch(err){setMessage("dialogMessage",err.message||"Tidak berjaya menyimpan rekod.",true);}
  }
  async function saveRow(table,id,row){if(id){const {error}=await supabase.from(table).update(row).eq("id",id);if(error)throw error;return {id};}return insertRow(table,row);}
  async function insertRow(table,row){const {data,error}=await supabase.from(table).insert(row).select().single();if(error)throw error;return data;}
  function ask(title,text,cb){$("confirmTitle").textContent=title;$("confirmText").textContent=text;confirmCallback=cb;$("confirmDialog").showModal();}
  async function removeRow(table,id){const {error}=await supabase.from(table).delete().eq("id",id);if(error)throw error;}
  async function billAction(action,id){const b=bills.find(x=>x.id===id);if(!b)return;if(action==="edit-bill")return openBillForm(b);if(action==="toggle-bill"){try{await saveRow("bills",id,{is_paid:!b.is_paid});await loadAll();}catch(e){setMessage("globalMessage",e.message,true)}}if(action==="delete-bill")ask("Padam bil?","Rekod bil ini akan dipadam.",async()=>{try{await removeRow("bills",id);await loadAll()}catch(e){setMessage("globalMessage",e.message,true)}});}
  async function fundAction(action,id){const f=funds.find(x=>x.id===id);if(!f)return;if(action==="edit-fund")return openFundForm(f);if(action==="fund-add"||action==="fund-withdraw"){const withdrawal=action==="fund-withdraw";openDialog(withdrawal?"Rekod pengeluaran":"Tambah simpanan",[
    field("amount","Amaun (RM)","number","",null,true),
    field("transaction_date","Tarikh transaksi","date",today()),
    field("notes","Catatan","text","",null,false,true)
  ],{kind:"fundTx",fund:f,withdrawal});}
    if(action==="fund-history"){const list=fundTx.filter(t=>t.fund_id===id).sort((a,b)=>(b.transaction_date||"").localeCompare(a.transaction_date||""));openDialog("Sejarah: "+f.name,[`<div class="field full">${list.length?list.map(t=>`<p>${esc(t.transaction_date)} · <strong>${t.transaction_type==="deposit"?"+":"−"}${money(t.amount)}</strong> · ${esc(t.notes||"—")}</p>`).join(""):"<p>Tiada transaksi.</p>"}</div>`],{kind:"history"});}
    if(action==="delete-fund")ask("Padam tabung?","Tabung dan sejarah transaksi berkaitan akan dipadam.",async()=>{try{await removeRow("funds",id);await loadAll()}catch(e){setMessage("globalMessage",e.message,true)}});
  }
  async function debtAction(action,id){const d=debts.find(x=>x.id===id);if(!d)return;if(action==="edit-debt")return openDebtForm(d);if(action==="debt-pay")return openDialog(d.debt_type==="owe"?"Rekod bayaran hutang":"Rekod kutipan hutang",[
    field("amount","Amaun (RM)","number","",null,true),
    field("transaction_date","Tarikh transaksi","date",today()),
    field("notes","Catatan","text","",null,false,true)
  ],{kind:"debtTx",debt:d});
    if(action==="debt-history"){const list=debtTx.filter(t=>t.debt_id===id).sort((a,b)=>(b.transaction_date||"").localeCompare(a.transaction_date||""));openDialog("Sejarah: "+d.person_name,[`<div class="field full">${list.length?list.map(t=>`<p>${esc(t.transaction_date)} · <strong>${money(t.amount)}</strong> · ${esc(t.notes||"—")}</p>`).join(""):"<p>Tiada transaksi.</p>"}</div>`],{kind:"history"});}
    if(action==="delete-debt")ask("Padam rekod hutang?","Rekod hutang dan sejarah transaksi berkaitan akan dipadam.",async()=>{try{await removeRow("debts",id);await loadAll()}catch(e){setMessage("globalMessage",e.message,true)}});
  }
  // Extend save handler to transaction forms before normal entity forms.
  const originalSaveDialog = saveDialog;
  $("itemForm").removeEventListener("submit", originalSaveDialog);
  $("itemForm").addEventListener("submit", async e => {
    if(!dialogContext || !["fundTx","debtTx"].includes(dialogContext.kind)) return originalSaveDialog(e);
    e.preventDefault(); const data=formData(),ctx=dialogContext,amount=Number(data.amount);
    try {
      if(!(amount>0))throw new Error("Amaun mesti lebih daripada RM0.");
      if(ctx.kind==="fundTx"){
        const f=ctx.fund, next=Number(f.current_amount||0)+(ctx.withdrawal?-amount:amount);
        if(next<0)throw new Error("Pengeluaran melebihi baki tabung.");
        await insertRow("fund_transactions",{fund_id:f.id,transaction_type:ctx.withdrawal?"withdrawal":"deposit",amount,transaction_date:data.transaction_date,notes:data.notes||null});
        await saveRow("funds",f.id,{current_amount:next});
      } else {
        const d=ctx.debt, next=Number(d.settled_amount||0)+amount;
        if(next>Number(d.original_amount))throw new Error("Amaun transaksi melebihi baki hutang.");
        await insertRow("debt_transactions",{debt_id:d.id,amount,transaction_date:data.transaction_date,notes:data.notes||null});
        await saveRow("debts",d.id,{settled_amount:next});
      }
      closeItemDialog();await loadAll();setMessage("globalMessage","Transaksi berjaya direkodkan.");
    } catch(err){setMessage("dialogMessage",err.message||"Transaksi gagal disimpan.",true);}
  });

  async function backupData(){
    try {
      await loadAll();
      const backup={format:"kewangan-peribadi-backup",version:1,exported_at:new Date().toISOString(),account:currentUser.email,
        data:{bills,funds,fund_transactions:fundTx,debts,debt_transactions:debtTx}};
      const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`backup-kewangan-${today()}.json`;a.click();URL.revokeObjectURL(url);
      setMessage("globalMessage","Fail backup dimuat turun.");
    } catch(e){setMessage("globalMessage","Backup gagal: "+e.message,true);}
  }
  async function restoreData(e){
    const file=e.target.files?.[0];e.target.value="";if(!file)return;
    ask("Restore data?","Restore akan MENAMBAH rekod daripada fail backup ke akaun semasa; ia tidak memadam rekod sedia ada. Elakkan restore fail sama dua kali kerana rekod boleh berganda.",async()=>{
      try {
        const backup=JSON.parse(await file.text());
        if(backup.format!=="kewangan-peribadi-backup"||backup.version!==1||!backup.data)throw new Error("Format fail backup tidak dikenali.");
        const d=backup.data;
        // Restore in parent-first order; IDs are generated by Supabase to avoid collisions.
        const idMaps={funds:{},debts:{}};
        for(const row of d.bills||[]) await insertRow("bills",pick(row,["name","category","amount","bill_month","due_date","is_paid","notes"]));
        for(const row of d.funds||[]){const originalId=row.id;const inserted=await insertRow("funds",pick(row,["name","target_amount","target_date","current_amount","notes"]));idMaps.funds[originalId]=inserted.id;}
        for(const row of d.fund_transactions||[]){const fundId=idMaps.funds[row.fund_id];if(fundId)await insertRow("fund_transactions",{fund_id:fundId,...pick(row,["transaction_type","amount","transaction_date","notes"])});}
        for(const row of d.debts||[]){const originalId=row.id;const inserted=await insertRow("debts",pick(row,["debt_type","person_name","description","original_amount","settled_amount","due_date"]));idMaps.debts[originalId]=inserted.id;}
        for(const row of d.debt_transactions||[]){const debtId=idMaps.debts[row.debt_id];if(debtId)await insertRow("debt_transactions",{debt_id:debtId,...pick(row,["amount","transaction_date","notes"])});}
        await loadAll();setMessage("globalMessage","Restore selesai. Semak rekod dan jumlah selepas import.");
      }catch(err){setMessage("globalMessage","Restore gagal: "+err.message,true);}
    });
  }
  function pick(obj,keys){const out={};keys.forEach(k=>{if(Object.prototype.hasOwnProperty.call(obj,k))out[k]=obj[k];});return out;}
  init();
})();
