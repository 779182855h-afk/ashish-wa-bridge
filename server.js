const express=require('express');
const cors=require('cors');
const QRCode=require('qrcode');
const {Client,LocalAuth}=require('whatsapp-web.js');
const app=express();
const PORT=Number(process.env.PORT||3030);
app.use(cors());app.use(express.json({limit:'1mb'}));
let qrText='';let state='starting';let client=null;let lastError='';
function phone(v){let n=String(v||'').replace(/\D/g,'');if(n.startsWith('00'))n=n.slice(2);if(n.startsWith('0'))n='967'+n.slice(1);return n;}
async function boot(){
  if(client)return;
  state='starting';
  client=new Client({authStrategy:new LocalAuth({clientId:'ashish-admin'}),puppeteer:{headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']}});
  client.on('qr',q=>{qrText=q;state='qr';console.log('\n[ASHISH] QR جاهز — افتح واتساب > الأجهزة المرتبطة > ربط جهاز\n');});
  client.on('authenticated',()=>{state='authenticated';qrText='';console.log('[ASHISH] تم التحقق من الجلسة');});
  client.on('ready',()=>{state='ready';qrText='';console.log('[ASHISH] واتساب جاهز لإرسال الإشعارات');});
  client.on('auth_failure',e=>{state='error';lastError=String(e||'auth_failure');});
  client.on('disconnected',r=>{state='disconnected';console.log('[ASHISH] disconnected',r);client=null;setTimeout(boot,2500);});
  try{await client.initialize();}catch(e){state='error';lastError=e.message||String(e);console.error(e);client=null;}
}
app.get('/status',(req,res)=>res.json({ok:true,state,ready:state==='ready',qr:!!qrText,label:state==='ready'?'متصل وجاهز':state==='qr'?'بانتظار مسح QR':'غير متصل',error:lastError}));
app.get('/qr',async(req,res)=>{if(!qrText)return res.json({ok:false,available:false});try{res.json({ok:true,available:true,dataUrl:await QRCode.toDataURL(qrText,{margin:1,width:360})});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.post('/start',async(req,res)=>{boot().catch(()=>{});res.json({ok:true});});
app.post('/send',async(req,res)=>{try{if(state!=='ready'||!client)return res.status(503).json({ok:false,error:'whatsapp_not_ready'});let n=phone(req.body.to);if(!n)return res.status(400).json({ok:false,error:'phone_missing'});let chat=n+'@c.us';let exists=await client.isRegisteredUser(chat);if(!exists)return res.status(400).json({ok:false,error:'number_not_registered',phone:n});let msg=String(req.body.message||'').trim();if(!msg)return res.status(400).json({ok:false,error:'message_missing'});let sent=await client.sendMessage(chat,msg);res.json({ok:true,id:sent.id&&sent.id._serialized||'',phone:n});}catch(e){res.status(500).json({ok:false,error:e.message||String(e)});}});
app.post('/logout',async(req,res)=>{try{if(client){await client.logout().catch(()=>{});await client.destroy().catch(()=>{});}client=null;qrText='';state='disconnected';setTimeout(boot,700);res.json({ok:true});}catch(e){res.status(500).json({ok:false,error:e.message});}});
app.listen(PORT,'127.0.0.1',()=>{console.log(`[ASHISH WA] http://127.0.0.1:${PORT}`);boot();});
