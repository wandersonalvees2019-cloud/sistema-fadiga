import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,addDoc,serverTimestamp,onSnapshot,query,orderBy,updateDoc,deleteDoc,writeBatch} from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js';

const cfg={apiKey:'AIzaSyAufmht7zvxG_8fwUeb59NBENppnt-MlhY',authDomain:'setor-de-fadiga.firebaseapp.com',projectId:'setor-de-fadiga',storageBucket:'setor-de-fadiga.firebasestorage.app',messagingSenderId:'843558361497',appId:'1:843558361497:web:54db0e57a70bcb0eb9db08'};
const fb=initializeApp(cfg),auth=getAuth(fb),db=getFirestore(fb);
const $=id=>document.getElementById(id);
let user=null,perfil=null,relatorios=[],pendencias=[],ciencias=[],editandoId=null;

const hoje=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
$('data').value=hoje();

function esc(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function dataBR(v){if(!v)return '-';const [a,m,d]=v.split('-');return `${d}/${m}/${a}`}
function selectedStatus(){
  document.querySelectorAll('.status-card').forEach(x=>x.classList.toggle('selected',x.querySelector('input').checked));
}
document.querySelectorAll('input[name=sit]').forEach(x=>x.addEventListener('change',selectedStatus)); selectedStatus();

$('responsavel').addEventListener('change',()=>{
  const o=$('responsavel').selectedOptions[0];
  $('turno').value=o?.dataset?.turno||'';
});

document.querySelectorAll('.nav').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('.nav').forEach(b=>b.classList.remove('on'));btn.classList.add('on');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  $('page-'+btn.dataset.page).classList.add('active');
  if(btn.dataset.page==='historico')renderRelatorios();
  if(btn.dataset.page==='pendencias')renderPendencias();
  if(btn.dataset.page==='passagem')renderPassagem();
  if(btn.dataset.page==='ciencias')renderCiencias();
}));

$('loginForm').onsubmit=async e=>{
 e.preventDefault();$('msg').textContent='Entrando...';
 try{await signInWithEmailAndPassword(auth,$('email').value.trim(),$('senha').value)}
 catch(err){console.error(err);$('msg').textContent='Não foi possível entrar. Confira o login único e a senha.'}
};
$('sair').onclick=()=>signOut(auth);

onAuthStateChanged(auth,async u=>{
 if(!u){user=null;perfil=null;$('login').classList.remove('hide');$('app').classList.add('hide');return}
 try{
  const s=await getDoc(doc(db,'usuarios',u.uid));
  if(!s.exists())throw Error('Acesso não cadastrado em usuarios.');
  perfil=s.data(); if(perfil.ativo!==true)throw Error('Acesso inativo.');
  user=u;$('usuario').textContent='Acesso do Setor • '+(perfil.perfil||'operador');
  $('login').classList.add('hide');$('app').classList.remove('hide');
  iniciarTempoReal();
 }catch(err){$('msg').textContent=err.message;await signOut(auth)}
});

function iniciarTempoReal(){
 onSnapshot(query(collection(db,'relatorios'),orderBy('createdAt','desc')),snap=>{
   relatorios=snap.docs.map(d=>({id:d.id,...d.data()}));renderRelatorios();renderPassagem();
 },err=>{console.error('relatorios',err);$('listaRelatorios').innerHTML='<div class="empty">Erro ao carregar relatórios: '+esc(err.message)+'</div>'});
 onSnapshot(query(collection(db,'pendencias'),orderBy('openedAt','desc')),snap=>{
   pendencias=snap.docs.map(d=>({id:d.id,...d.data()}));renderPendencias();renderPassagem();
 },err=>{console.error('pendencias',err);$('listaPendencias').innerHTML='<div class="empty">Erro ao carregar pendências: '+esc(err.message)+'</div>'});
 onSnapshot(collection(db,'ciencia_gestao'),snap=>{
   ciencias=snap.docs.map(d=>({id:d.id,...d.data()}));
   renderRelatorios(); renderPendencias(); renderPassagem(); renderCiencias();
 },err=>{console.error('ciencia_gestao',err);});
}

$('limpar').onclick=()=>{ cancelarEdicao(); $('relatorio').reset();$('data').value=hoje();$('turno').value='';$('save').textContent='';selectedStatus() };
function cancelarEdicao(){editandoId=null;$('btnSalvar').textContent='▣ Salvar Relatório';}

$('relatorio').onsubmit=async e=>{
 e.preventDefault();
 const nome=$('responsavel').value,turno=$('turno').value;
 if(!nome||!turno){$('save').textContent='Selecione o colaborador antes de salvar.';return}
 const btn=$('btnSalvar');btn.disabled=true;btn.textContent='Salvando...';$('save').textContent='';
 try{
  const situacao=document.querySelector('input[name=sit]:checked').value;
  const dados={dataTurno:$('data').value,turno,horario:$('horario').value,responsavelUid:user.uid,responsavelNome:nome,situacao,
   sistemaFadiga:$('sistema').value,condicoesOperacionais:$('condicoes').value,resumo:$('resumo').value.trim(),
   ocorrencias:$('ocorrencias').value.trim(),pendenciasRecebidas:$('recebidas').value.trim(),pendenciasGeradas:$('geradas').value.trim(),
   acoes:$('acoes').value.trim(),passagemTurno:$('passagem').value.trim(),status:'FINALIZADO',createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  let ref;
  if(editandoId){
    const anterior=relatorios.find(r=>r.id===editandoId);
    const atualizados={...dados,createdAt:anterior?.createdAt||serverTimestamp(),updatedAt:serverTimestamp()};
    await updateDoc(doc(db,'relatorios',editandoId),atualizados);
    ref={id:editandoId};
    $('save').textContent='Relatório atualizado com sucesso.';
    cancelarEdicao();
  }else{
    ref=await addDoc(collection(db,'relatorios'),dados);
    if(dados.pendenciasGeradas)await addDoc(collection(db,'pendencias'),{descricao:dados.pendenciasGeradas,reportOriginId:ref.id,status:'ABERTA',turnoOrigem:turno,openedByUid:user.uid,openedByNome:nome,openedAt:serverTimestamp(),updatedAt:serverTimestamp()});
    $('save').textContent='Relatório salvo com sucesso. Ele já está disponível em Meus Relatórios.';
  }
  $('resumo').value='';$('ocorrencias').value='';$('recebidas').value='';$('geradas').value='';$('acoes').value='';$('passagem').value='';
 }catch(err){console.error(err);$('save').textContent='Erro ao salvar: '+err.message}
 finally{btn.disabled=false;btn.textContent='▣ Salvar Relatório'}
};

['fData','fTurno','fResp','fSit','fBusca'].forEach(id=>$(id).addEventListener(id==='fBusca'?'input':'change',renderRelatorios));
$('limparFiltros').onclick=()=>{['fData','fTurno','fResp','fSit','fBusca'].forEach(id=>$(id).value='');renderRelatorios()};
['pStatus','pTurno','pBusca'].forEach(id=>$(id).addEventListener(id==='pBusca'?'input':'change',renderPendencias));


function tsBR(ts){
 if(!ts)return '-';
 const d=ts.toDate?ts.toDate():new Date(ts);
 if(isNaN(d))return '-';
 return d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
}
function cienciaRelatorio(id){return ciencias.find(c=>c.relatorioId===id)}
function cienciaPendencia(id){return ciencias.find(c=>c.pendenciaId===id)}
function blocoCienciaRel(id){
 const c=cienciaRelatorio(id);
 return c
 ? `<div class="ack ack-ok">✓ Ciente pela Gestão <span>${esc(c.gestorNome||'Gestão')} • ${tsBR(c.createdAt)}</span></div>`
 : `<div class="ack ack-wait">◷ Aguardando ciência da Gestão</div>`;
}
function blocoCienciaPend(id){
 const c=cienciaPendencia(id);
 return c
 ? `<div class="ack ack-ok">✓ Ciente pela Gestão <span>${esc(c.gestorNome||'Gestão')} • ${tsBR(c.createdAt)}</span></div>`
 : `<div class="ack ack-wait">◷ Aguardando ciência da Gestão</div>`;
}

function textoRel(r){return [r.resumo,r.ocorrencias,r.pendenciasRecebidas,r.pendenciasGeradas,r.acoes,r.passagemTurno].join(' ').toLowerCase()}
function renderRelatorios(){
 if(!$('listaRelatorios'))return;
 let a=[...relatorios];
 const d=$('fData').value,t=$('fTurno').value,n=$('fResp').value,s=$('fSit').value,b=$('fBusca').value.trim().toLowerCase();
 if(d)a=a.filter(r=>r.dataTurno===d);if(t)a=a.filter(r=>r.turno===t);if(n)a=a.filter(r=>r.responsavelNome===n);if(s)a=a.filter(r=>r.situacao===s);
 if(b)a=a.filter(r=>(r.responsavelNome||'').toLowerCase().includes(b)||textoRel(r).includes(b));
 $('totalRelatorios').textContent=a.length+' registro'+(a.length===1?'':'s');
 $('listaRelatorios').innerHTML=a.length?a.map(cardRelatorio).join(''):'<div class="empty">Nenhum relatório encontrado com esses filtros.</div>';
 document.querySelectorAll('[data-view-rel]').forEach(b=>b.onclick=()=>abrirRelatorio(b.dataset.viewRel));
 document.querySelectorAll('[data-edit-rel]').forEach(b=>b.onclick=()=>editarRelatorio(b.dataset.editRel));
 document.querySelectorAll('[data-del-rel]').forEach(b=>b.onclick=()=>excluirRelatorio(b.dataset.delRel));
}
function cardRelatorio(r){
 return `<article class="record ${esc(r.situacao)}"><div class="record-top"><div><h3>${esc(r.responsavelNome)} • Turno ${esc(r.turno)}</h3><div class="meta">${dataBR(r.dataTurno)} • ${esc(r.horario||'')}</div></div><span class="badge ${esc(r.situacao)}">${esc(r.situacao)}</span></div><p>${esc(r.resumo||'Sem resumo')}</p>${blocoCienciaRel(r.id)}<div class="record-actions"><button class="small-btn" data-edit-rel="${r.id}">Editar</button><button class="small-btn danger" data-del-rel="${r.id}">Excluir</button><button class="small-btn orange" data-view-rel="${r.id}">Visualizar completo</button></div></article>`
}
function abrirRelatorio(id){
 const r=relatorios.find(x=>x.id===id);if(!r)return;
 const campos=[['Resumo',r.resumo],['Ocorrências',r.ocorrencias],['Pendências recebidas',r.pendenciasRecebidas],['Pendências geradas',r.pendenciasGeradas],['Ações realizadas',r.acoes],['Passagem de turno / Observações',r.passagemTurno]];
 $('modalBody').innerHTML=`<h2>Relatório • ${esc(r.responsavelNome)} • Turno ${esc(r.turno)}</h2><p class="meta">${dataBR(r.dataTurno)} • ${esc(r.horario||'')} • ${esc(r.situacao)}</p>${blocoCienciaRel(r.id)}<div class="detail-grid"><div class="detail"><b>Sistema de Fadiga</b>${esc(r.sistemaFadiga||'-')}</div><div class="detail"><b>Condições Operacionais</b>${esc(r.condicoesOperacionais||'-')}</div>${campos.map(c=>`<div class="detail"><b>${c[0]}</b>${esc(c[1]||'-')}</div>`).join('')}</div>`;
 $('modal').classList.remove('hide');
}


function editarRelatorio(id){
 const r=relatorios.find(x=>x.id===id);if(!r)return;
 editandoId=id;
 $('data').value=r.dataTurno||hoje();$('responsavel').value=r.responsavelNome||'';$('turno').value=r.turno||'';$('horario').value=r.horario||'06:00 - 18:00';
 const radio=document.querySelector(`input[name=sit][value="${r.situacao||'NORMAL'}"]`);if(radio)radio.checked=true;selectedStatus();
 $('sistema').value=r.sistemaFadiga||'NORMAL';$('condicoes').value=r.condicoesOperacionais||'NORMAIS';$('resumo').value=r.resumo||'';$('ocorrencias').value=r.ocorrencias||'';$('recebidas').value=r.pendenciasRecebidas||'';$('geradas').value=r.pendenciasGeradas||'';$('acoes').value=r.acoes||'';$('passagem').value=r.passagemTurno||'';
 document.querySelectorAll('.nav').forEach(b=>b.classList.toggle('on',b.dataset.page==='novo'));document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));$('page-novo').classList.add('active');
 $('btnSalvar').textContent='✓ Salvar Alterações';$('save').textContent='Editando relatório existente. Salve para confirmar as alterações.';window.scrollTo({top:0,behavior:'smooth'});
}
async function excluirRelatorio(id){
 const r=relatorios.find(x=>x.id===id);if(!r)return;
 const vinculadas=pendencias.filter(p=>p.reportOriginId===id);
 const aviso=vinculadas.length?`Este relatório possui ${vinculadas.length} pendência(s) vinculada(s). Ao excluir, elas também serão apagadas.

Deseja continuar?`:'Deseja realmente excluir este relatório? Esta ação não poderá ser desfeita.';
 if(!confirm(aviso))return;
 try{
   const batch=writeBatch(db);batch.delete(doc(db,'relatorios',id));vinculadas.forEach(p=>batch.delete(doc(db,'pendencias',p.id)));await batch.commit();
   if(editandoId===id){cancelarEdicao();$('relatorio').reset();$('data').value=hoje();}
 }catch(err){alert('Não foi possível excluir o relatório: '+err.message)}
}

function renderPendencias(){
 let a=[...pendencias],st=$('pStatus').value,t=$('pTurno').value,b=$('pBusca').value.trim().toLowerCase();
 if(st)a=a.filter(p=>p.status===st);if(t)a=a.filter(p=>p.turnoOrigem===t);if(b)a=a.filter(p=>(p.descricao||'').toLowerCase().includes(b)||(p.openedByNome||'').toLowerCase().includes(b));
 $('totalPendencias').textContent=pendencias.filter(p=>p.status==='ABERTA').length+' aberta'+(pendencias.filter(p=>p.status==='ABERTA').length===1?'':'s');
 $('listaPendencias').innerHTML=a.length?a.map(cardPendencia).join(''):'<div class="empty">Nenhuma pendência encontrada.</div>';
 document.querySelectorAll('[data-toggle-p]').forEach(b=>b.onclick=()=>togglePendencia(b.dataset.toggleP));
 document.querySelectorAll('[data-del-p]').forEach(b=>b.onclick=()=>excluirPendencia(b.dataset.delP));
}
function cardPendencia(p){
 const aberta=p.status!=='TRATADA';
 return `<article class="record ${aberta?'ATENCAO':'NORMAL'}"><div class="record-top"><div><h3>${aberta?'Pendência aberta':'Pendência tratada'}</h3><div class="meta">Origem: ${esc(p.openedByNome||'-')} • Turno ${esc(p.turnoOrigem||'-')}</div></div><span class="badge ${aberta?'ATENCAO':'NORMAL'}">${esc(p.status||'ABERTA')}</span></div><p>${esc(p.descricao||'')}</p>${blocoCienciaPend(p.id)}<div class="record-actions"><button class="small-btn danger" data-del-p="${p.id}">Excluir</button><button class="small-btn ${aberta?'green':'orange'}" data-toggle-p="${p.id}">${aberta?'Marcar como tratada':'Reabrir'}</button></div></article>`
}
async function togglePendencia(id){
 const p=pendencias.find(x=>x.id===id);if(!p)return;
 try{await updateDoc(doc(db,'pendencias',id),{status:p.status==='TRATADA'?'ABERTA':'TRATADA',updatedAt:serverTimestamp(),treatedByUid:user.uid})}
 catch(err){alert('Não foi possível atualizar: '+err.message)}
}

async function excluirPendencia(id){
 const p=pendencias.find(x=>x.id===id);if(!p)return;
 if(!confirm('Deseja realmente excluir esta pendência? Esta ação não poderá ser desfeita.'))return;
 try{await deleteDoc(doc(db,'pendencias',id))}catch(err){alert('Não foi possível excluir a pendência: '+err.message)}
}

function renderPassagem(){
 const rs=relatorios.slice(0,5),ps=pendencias.filter(p=>p.status==='ABERTA').slice(0,8);
 $('passRelatorios').innerHTML=rs.length?rs.map(cardRelatorio).join(''):'<div class="empty">Sem relatórios recentes.</div>';
 $('passPendencias').innerHTML=ps.length?ps.map(cardPendencia).join(''):'<div class="empty">Nenhuma pendência aberta.</div>';
 document.querySelectorAll('#page-passagem [data-view-rel]').forEach(b=>b.onclick=()=>abrirRelatorio(b.dataset.viewRel));
 document.querySelectorAll('#page-passagem [data-edit-rel]').forEach(b=>b.onclick=()=>editarRelatorio(b.dataset.editRel));
 document.querySelectorAll('#page-passagem [data-del-rel]').forEach(b=>b.onclick=()=>excluirRelatorio(b.dataset.delRel));
 document.querySelectorAll('#page-passagem [data-toggle-p]').forEach(b=>b.onclick=()=>togglePendencia(b.dataset.toggleP));
 document.querySelectorAll('#page-passagem [data-del-p]').forEach(b=>b.onclick=()=>excluirPendencia(b.dataset.delP));
}

function renderCiencias(){
 if(!$('listaCiencias'))return;
 const ordenadas=[...ciencias].sort((a,b)=>{
   const ta=a.createdAt?.toMillis?a.createdAt.toMillis():0;
   const tb=b.createdAt?.toMillis?b.createdAt.toMillis():0;
   return tb-ta;
 });
 $('totalCiencias').textContent=ordenadas.length+' ciência'+(ordenadas.length===1?'':'s');
 if($('badgeCiencias'))$('badgeCiencias').textContent=ordenadas.length;
 $('listaCiencias').innerHTML=ordenadas.length?ordenadas.map(c=>{
   if(c.relatorioId){
     const r=relatorios.find(x=>x.id===c.relatorioId);
     return `<article class="record NORMAL"><div class="record-top"><div><h3>✓ Ciência em relatório</h3><div class="meta">${r?`${esc(r.responsavelNome)} • Turno ${esc(r.turno)} • ${dataBR(r.dataTurno)}`:'Relatório'}</div></div><span class="badge NORMAL">CIENTE</span></div><p>Gestão: <b>${esc(c.gestorNome||'Gestão')}</b> • ${tsBR(c.createdAt)}</p>${r?`<div class="record-actions"><button class="small-btn orange" data-view-ciencia-rel="${r.id}">Visualizar relatório</button></div>`:''}</article>`;
   }
   if(c.pendenciaId){
     const p=pendencias.find(x=>x.id===c.pendenciaId);
     return `<article class="record NORMAL"><div class="record-top"><div><h3>✓ Ciência em pendência</h3><div class="meta">${p?`Origem: ${esc(p.openedByNome||'-')} • Turno ${esc(p.turnoOrigem||'-')}`:'Pendência'}</div></div><span class="badge NORMAL">CIENTE</span></div><p>${p?esc(p.descricao||''):'Registro de pendência'}<br><span class="meta">Gestão: ${esc(c.gestorNome||'Gestão')} • ${tsBR(c.createdAt)}</span></p></article>`;
   }
   return '';
 }).join(''):'<div class="empty">A Gestão ainda não registrou ciência em relatórios ou pendências.</div>';
 document.querySelectorAll('[data-view-ciencia-rel]').forEach(b=>b.onclick=()=>abrirRelatorio(b.dataset.viewCienciaRel));
}

$('modalClose').onclick=()=>$('modal').classList.add('hide');
$('modal').onclick=e=>{if(e.target===$('modal'))$('modal').classList.add('hide')};
