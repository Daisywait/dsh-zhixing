import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {makeHandler} from '../lib/index.js';
import {initialize} from '../lib/storage.js';
import {applyOperation} from '../scripts/store.mjs';

// Optional browser integration check; no browser dependency is shipped in the plugin.
test('learning actions, material review and beginner entry work without writing evidence',
  {skip:!process.env.ZHIXING_PLAYWRIGHT,timeout:90000},async()=>{
    const {chromium}=createRequire(import.meta.url)(process.env.ZHIXING_PLAYWRIGHT);
    const root=await mkdtemp(join(tmpdir(),'zhixing-ui-'));
    let server,browser;
    try{
      await initialize(root);
      const demo=JSON.parse(await readFile(new URL('../examples/demo.json',import.meta.url),'utf8'));
      const target=demo.topics[0];
      const fixture=JSON.stringify(applyOperation(demo,{type:'set-next',expectedRevision:demo.revision,topicId:target.id,author:'test',next:target.next,diagnosis:{gap:'对照两种行为变化',basisType:'prior',basis:'测试中的暂定判断',attemptIds:[],material:'两个完整例子'}}));
      await writeFile(join(root,'data/archive.json'),fixture);
      server=http.createServer(makeHandler(root,()=>true));
      server.listen(0,'127.0.0.1');await once(server,'listening');
      browser=await chromium.launch({headless:true,...(process.env.ZHIXING_CHROME?{executablePath:process.env.ZHIXING_CHROME}:{})});
      const page=await browser.newPage({viewport:{width:1280,height:900}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{
        window.copied=[];
        Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copied.push(text)}});
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/api/zhixing/`);
      await page.getByRole('button',{name:'先讲给我听',exact:true}).waitFor();
      await page.locator('.diagnosis-summary summary').click();
      assert.match(await page.locator('.diagnosis-summary').innerText(),/暂定判断/);
      for(const [label,expected] of [['先讲给我听','不先测验'],['换个例子','不把它当测验'],['试一道新题','等我回答后再揭示答案'],['继续学习','判断它是否适合当前状态']]){
        await page.getByRole('button',{name:label,exact:true}).click();
        assert.ok((await page.evaluate(()=>window.copied.at(-1))).includes(expected));
      }
      await page.locator('#toast').waitFor({state:'hidden'});
      assert.equal(await page.locator('.example-steps li').count(),3);
      const first=await page.locator('.example-steps').innerText();
      await page.locator('[data-material-pair="1"]').click();
      assert.notEqual(await page.locator('.example-steps').innerText(),first);
      for(const label of ['这一步没看懂','例子或解释有问题']){
        await page.getByRole('button',{name:label,exact:true}).click();
        const request=await page.evaluate(()=>window.copied.at(-1));
        assert.ok(request.includes('当前查看的材料'));
        assert.ok(request.includes('错误作答'));
      }
      for(const [name,width,height] of [['desktop',1280,900],['desktop-wide',1600,1000]]){
        await page.setViewportSize({width,height});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');
        if(process.env.ZHIXING_SCREENSHOTS){
          await mkdir(process.env.ZHIXING_SCREENSHOTS,{recursive:true});
          await page.screenshot({path:resolve(process.env.ZHIXING_SCREENSHOTS,`learning-${name}.png`),fullPage:true});
        }
      }
      await page.getByRole('button',{name:'新建学习主题',exact:true}).click();
      await page.locator('#learning-goal').fill('我完全不懂条件概率');
      await page.getByRole('button',{name:'从这里开始',exact:true}).click();
      const prompt=await page.evaluate(()=>window.copied.at(-1));
      assert.ok(prompt.includes('我完全不懂条件概率'));
      assert.ok(prompt.includes('先短讲解'));
      assert.ok(!prompt.includes('从第0层开始'));
      await page.goto(`http://127.0.0.1:${server.address().port}/api/zhixing/?embedded`);
      await page.locator('.teaching-example').waitFor();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Embedded overflow');
      if(process.env.ZHIXING_SCREENSHOTS)await page.screenshot({path:resolve(process.env.ZHIXING_SCREENSHOTS,'learning-embedded-desktop.png'),fullPage:true});
      assert.deepEqual(errors,[]);
      assert.equal(await readFile(join(root,'data/archive.json'),'utf8'),fixture);
    }finally{
      await browser?.close();
      if(server?.listening)await new Promise(r=>server.close(r));
      await rm(root,{recursive:true,force:true});
    }
  });
