// Worker v46: generador propio, sin dependencias externas, caracteres normalizados
function ex(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function nz(s){
  var t=String(s),o='';
  for(var i=0;i<t.length;i++){
    var c=t.charCodeAt(i),r=null;
    if(c>=224&&c<=229)r='aeiou'.charAt(c-224);
    else if(c>=192&&c<=197)r='AEIOU'.charAt(c-192);
    else if(c===241)r='n';else if(c===209)r='N';
    else if(c===252)r='u';else if(c===220)r='U';
    else if(c===191)r='?';else if(c===161)r='!';
    else if(c===945)r='alpha';else if(c===969)r='omega';
    else if(c===8804)r='<=';else if(c===8805)r='>=';
    else if(c<32||c>126)r='?';
    o+=(r!==null?r:t[i]);
  }
  return o;
}
function crc(d){
  if(!crc.t){var t=new Uint32Array(256);for(var n=0;n<256;n++){var c=n;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c;}crc.t=t;}
  var r=0xFFFFFFFF;for(var i=0;i<d.length;i++)r=crc.t[(r^d[i])&255]^(r>>>8);return(r^0xFFFFFFFF)>>>0;
}
function mkzip(fs){
  var e=new TextEncoder(),off=0,pt=[],ce=[];
  fs.forEach(function(f){
    var nb=e.encode(f.name),db=typeof f.content==='string'?e.encode(f.content):f.content;
    var cr=crc(db),lh=new DataView(new ArrayBuffer(30));
    lh.setUint32(0,0x04034b50,true);lh.setUint16(4,20,true);
    lh.setUint32(14,cr,true);lh.setUint32(18,db.length,true);lh.setUint32(22,db.length,true);
    lh.setUint16(26,nb.length,true);
    pt.push(new Uint8Array(lh.buffer),nb,db);ce.push({b:nb,c:cr,s:db.length,o:off});
    off+=30+nb.length+db.length;
  });
  var cs=off,cz=0;
  ce.forEach(function(x){
    var h=new DataView(new ArrayBuffer(46));
    h.setUint32(0,0x02014b50,true);h.setUint16(4,20,true);h.setUint16(6,20,true);
    h.setUint32(16,x.c,true);h.setUint32(20,x.s,true);h.setUint32(24,x.s,true);
    h.setUint16(28,x.b.length,true);h.setUint32(42,x.o,true);
    pt.push(new Uint8Array(h.buffer),x.b);cz+=46+x.b.length;
  });
  var en=new DataView(new ArrayBuffer(22));
  en.setUint32(0,0x06054b50,true);en.setUint16(8,ce.length,true);en.setUint16(10,ce.length,true);
  en.setUint32(12,cz,true);en.setUint32(16,cs,true);pt.push(new Uint8Array(en.buffer));
  var t=0;pt.forEach(function(p){t+=p.length;});
  var o=new Uint8Array(t),q=0;pt.forEach(function(p){o.set(p,q);q+=p.length;});
  return o;
}
function gDocx(ss){
  var b='<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="48"/><w:color w:val="1E3A8A"/></w:rPr><w:t>INFORME EYA-28</w:t></w:r></w:p>';
  b+='<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/><w:color w:val="475569"/></w:rPr><w:t>Escala del Yo Algoritmico - UCLV</w:t></w:r></w:p>';
  b+='<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="400"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="64748B"/></w:rPr><w:t>'+ex(new Date().toLocaleString('es-ES'))+'</w:t></w:r></w:p>';
  ss.forEach(function(s){
    b+='<w:p><w:pPr><w:shd w:fill="1E3A8A" w:val="clear"/><w:spacing w:before="300" w:after="150"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="28"/></w:rPr><w:t>'+ex(s.titulo)+'</w:t></w:r></w:p>';
    (s.parrafos||[]).forEach(function(p){b+='<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:after="100"/></w:pPr><w:r><w:rPr><w:sz w:val="22"/></w:rPr><w:t>'+ex(p)+'</w:t></w:r></w:p>';});
    (s.tablas||[]).forEach(function(tb){
      if(!tb.length)return;
      b+='<w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="6" w:color="94A3B8"/><w:left w:val="single" w:sz="6" w:color="94A3B8"/><w:bottom w:val="single" w:sz="6" w:color="94A3B8"/><w:right w:val="single" w:sz="6" w:color="94A3B8"/><w:insideH w:val="single" w:sz="6" w:color="94A3B8"/><w:insideV w:val="single" w:sz="6" w:color="94A3B8"/></w:tblBorders></w:tblPr>';
      tb.forEach(function(rw,ri){
        b+='<w:tr>'+(ri===0?'<w:trPr><w:tblHeader/></w:trPr>':'');
        rw.forEach(function(cl){
          var h=ri===0;
          b+='<w:tc><w:tcPr><w:shd w:fill="'+(h?'1E293B':(ri%2?'F1F5F9':'FFFFFF'))+'" w:val="clear"/></w:tcPr><w:p><w:r><w:rPr>'+(h?'<w:b/><w:color w:val="FFFFFF"/>':'<w:color w:val="1E293B"/>')+'<w:sz w:val="20"/></w:rPr><w:t>'+ex(cl)+'</w:t></w:r></w:p></w:tc>';
        });
        b+='</w:tr>';
      });
      b+='</w:tbl><w:p><w:r><w:t></w:t></w:r></w:p>';
    });
  });
  var dx='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+b+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>';
  var ct='<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  var rl='<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  return mkzip([{name:'[Content_Types].xml',content:ct},{name:'_rels/.rels',content:rl},{name:'word/document.xml',content:dx}]);
}
function pe(s){return nz(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)').substring(0,170);}
function gPDF(ss){
  var e=new TextEncoder(),pg=[],ct='',y=800;
  function np(){if(ct)pg.push(ct);ct='';y=800;}
  function wr(t,sz,bd,cl){
    var ws=String(t).split(' '),ln='',mx=Math.floor(490/(sz*0.5)),ls=[];
    for(var i=0;i<ws.length;i++){var ts=ln?ln+' '+ws[i]:ws[i];if(ts.length>mx&&ln){ls.push(ln);ln=ws[i];}else ln=ts;}
    if(ln)ls.push(ln);if(!ls.length)ls=[''];
    for(var j=0;j<ls.length;j++){if(y<55)np();ct+='BT /F'+(bd?'2':'1')+' '+sz+' Tf '+(cl||'0 0 0')+' rg 55 '+y+' Td ('+pe(ls[j])+') Tj ET\n';y-=sz+2.5;}
  }
  function tb(rw){
    if(!rw.length)return;
    var nc=0;for(var i=0;i<rw.length;i++)nc=Math.max(nc,rw[i].length);if(!nc)return;
    var cw=500/nc;
    for(var ri=0;ri<rw.length;ri++){
      if(y<65)np();var h=17;
      if(ri===0)ct+='0.12 0.16 0.23 rg 55 '+(y-h)+' 500 '+h+' re f\n';
      for(var ci=0;ci<rw[ri].length;ci++){
        var x=55+ci*cw;
        ct+='0.65 0.71 0.78 RG 0.4 w '+x.toFixed(1)+' '+(y-h)+' '+cw.toFixed(1)+' '+h+' re S\n';
        ct+='BT /F'+(ri===0?'2':'1')+' 7.5 Tf '+(ri===0?'1 1 1':'0.15 0.2 0.3')+' rg '+(x+2.5).toFixed(1)+' '+(y-12)+' Td ('+pe(String(rw[ri][ci]).substring(0,Math.floor(cw/4.5)))+') Tj ET\n';
      }
      y-=h;
    }
    y-=8;
  }
  np();y=680;
  ct+='0.12 0.23 0.54 rg 0 620 595 222 re f\n';
  wr('INFORME EYA-28',26,true,'1 1 1');y-=6;
  wr('Escala del Yo Algoritmico - UCLV',12,false,'0.75 0.85 1');y-=4;
  wr('Universidad Central "Marta Abreu" de Las Villas',9,false,'0.75 0.85 1');y=580;
  wr('Generado: '+new Date().toLocaleString('es-ES'),9,false,'0.4 0.45 0.55');y-=14;
  ss.forEach(function(s){
    if(y<110)np();
    ct+='0.12 0.23 0.54 rg 55 '+(y-4)+' 500 13 re f\n';
    ct+='BT /F2 10 Tf 1 1 1 rg 58 '+(y+6)+' Td ('+pe(s.titulo.substring(0,75))+') Tj ET\n';y-=16;
    (s.parrafos||[]).forEach(function(p){wr(p,9,false,'0.2 0.25 0.35');y-=2;});
    (s.tablas||[]).forEach(function(t){tb(t);});
    y-=8;
  });
  if(ct)pg.push(ct);
  var pdf='%PDF-1.4\n',of=[0],n=1;
  of[n]=pdf.length;pdf+=n+' 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';n++;
  var pgid=n++;
  of[n]=pdf.length;pdf+=n+' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';var f1=n++;
  of[n]=pdf.length;pdf+=n+' 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n';var f2=n++;
  var pn=[];
  for(var qi=0;qi<pg.length;qi++){
    var cn=n++;of[cn]=pdf.length;
    var cb=e.encode(pg[qi]);
    pdf+=cn+' 0 obj\n<< /Length '+cb.length+' >>\nstream\n'+pg[qi]+'\nendstream\nendobj\n';
    var k=n++;of[k]=pdf.length;
    pdf+=k+' 0 obj\n<< /Type /Page /Parent '+pgid+' 0 R /MediaBox [0 0 595 842] /Contents '+cn+' 0 R /Resources << /Font << /F1 '+f1+' 0 R /F2 '+f2+' 0 R >> >> >>\nendobj\n';
    pn.push(k);
  }
  of[pgid]=pdf.length;
  pdf+=pgid+' 0 obj\n<< /Type /Pages /Kids ['+pn.map(function(x){return x+' 0 R';}).join(' ')+'] /Count '+pn.length+' >>\nendobj\n';
  var xr=pdf.length;
  pdf+='xref\n0 '+n+'\n0000000000 65535 f \n';
  for(var xi=1;xi<n;xi++)pdf+=String(of[xi]||0).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+n+' /Root 1 0 R >>\nstartxref\n'+xr+'\n%%EOF';
  return e.encode(pdf);
}
function b64(b){var s='';for(var i=0;i<b.length;i+=8192)s+=String.fromCharCode.apply(null,b.subarray(i,i+8192));return btoa(s);}
self.onmessage=function(e){
  try{
    var d=e.data;
    self.postMessage({status:'docx'});
    var db=gDocx(d.secciones);
    self.postMessage({status:'pdf'});
    var pb=gPDF(d.secciones);
    self.postMessage({status:'sps'});
    self.postMessage({status:'done',docxB64:b64(db),pdfB64:b64(pb),spsB64:btoa(unescape(encodeURIComponent(d.sps)))});
  }catch(err){self.postMessage({status:'error',message:String((err&&err.message)||err)});}
};
