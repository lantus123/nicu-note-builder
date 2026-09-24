// Synthetic contract tests. Real Chromium additionally verifies native Enter/innerText.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../../index.html','utf8');
const plain='Synthetic first line.\nSynthetic second line.';

async function check({collapsed,fail=false}){
  const errors=[],copies=[],reads=[];
  const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://nicu-clipboard.test/',
    beforeParse(W){
      W.scrollTo=()=>{};
      W.addEventListener('error',e=>errors.push(String(e.error?.message||e.message)));
      // jsdom does not implement layout. Model the browser's visible/hidden
      // innerText distinction; verify the offscreen reader's actual DOM state.
      Object.defineProperty(W.HTMLElement.prototype,'innerText',{configurable:true,get(){
        if(!this.classList.contains('note'))return this.textContent;
        const hidden=!!this.closest('[hidden]');
        reads.push({hidden,original:this.id==='note',connected:this.isConnected,
          offscreen:this.style.left==='-10000px',ariaHidden:this.getAttribute('aria-hidden')});
        return hidden?this.textContent:plain;
      }});
      Object.defineProperty(W.navigator,'clipboard',{configurable:true,value:{async writeText(text){
        if(fail)throw new Error('Synthetic denied clipboard');copies.push(text);
      }}});
    }});
  try{
    const W=dom.window,d=W.document,note=d.getElementById('note'),body=d.getElementById('previewBody');
    // 合成的多節點預覽（span＋div）：只為驗證「複製不改寫來源、離屏副本會被移除」。
    note.innerHTML='<span>Synthetic first line.</span><div>Synthetic second line.</div>';
    if(collapsed){W.innerWidth=390;W.dispatchEvent(new W.Event('resize'));}
    assert.equal(body.hidden,collapsed);
    const markup=note.innerHTML,children=d.body.children.length;
    d.getElementById('copy').click();
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(note.innerHTML,markup,'Copy never rewrites the source note');
    assert.equal(d.body.children.length,children,'Temporary reader is removed');
    assert.equal(note.hasAttribute('contenteditable'),false,'The preview stays read-only');
    assert.equal(d.getElementById('copy').textContent,'複製','Button width stays stable');
    assert.equal(d.getElementById('copyStatus').hidden,false);
    assert.equal(d.getElementById('copyStatus').getAttribute('role'),'status');
    if(fail)assert.match(d.getElementById('copyStatus').textContent,/未能複製/);
    else assert.deepEqual(copies,[plain]);
    assert.deepEqual(reads,[{hidden:false,original:!collapsed,connected:true,
      offscreen:collapsed,ariaHidden:collapsed?'true':null}]);
    assert.deepEqual(errors,[]);
  }finally{dom.window.close();}
}

(async()=>{
  for(const options of [{collapsed:false},{collapsed:true},{collapsed:true,fail:true}]){
    await check(options);
    console.log(`✓ clipboard ${JSON.stringify(options)}`);
  }
  console.log('✓ 3 clipboard UI scenarios passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
