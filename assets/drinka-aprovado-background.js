/* Fundo contínuo Drinka Economiza. Sem painéis brancos nem mosaico de imagens. */
(()=>{
  const css=`
    html{background:#ffe8cd!important}
    body{
      background-color:#ffe9d1!important;
      background-image:
        radial-gradient(ellipse 46% 75% at 0% 26%,rgba(255,153,66,.24) 0%,rgba(255,174,91,.11) 44%,transparent 100%),
        radial-gradient(ellipse 43% 70% at 100% 61%,rgba(255,147,55,.23) 0%,rgba(255,164,75,.10) 42%,transparent 100%),
        linear-gradient(112deg,#ffdfbb 0%,#ffe8cf 22%,#fff0dc 48%,#ffe9cf 76%,#ffdeb8 100%)!important;
      background-size:100% 100%,100% 100%,100% 100%!important;
      background-position:center!important;
      background-repeat:no-repeat!important;
      background-attachment:fixed!important;
    }
    @media(max-width:760px){
      html{background:#ffe7cb!important}
      body{
        background-color:#ffe8cd!important;
        background-image:
          radial-gradient(ellipse 85% 55% at -15% 22%,rgba(255,147,52,.19),transparent 90%),
          radial-gradient(ellipse 90% 65% at 110% 68%,rgba(255,159,72,.17),transparent 88%),
          linear-gradient(155deg,#ffe0bd 0%,#fff0dd 45%,#ffe2bf 100%)!important;
        background-size:100% 100%,100% 100%,100% 100%!important;
        background-repeat:no-repeat!important;
        background-position:center!important;
        background-attachment:scroll!important;
      }
    }
  `;
  const style=document.getElementById('drinka-approved-background')||document.createElement('style');
  style.id='drinka-approved-background';
  style.textContent=css;
  if(!style.isConnected)document.head.appendChild(style);
})();
