(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const thumbs = [...document.querySelectorAll(".owl-item .item, .owl-item img.imgTitleBelow")];
  const seen = new Set();
  for (let i = 0; i < thumbs.length; i++) {
    const el = thumbs[i];
    el.scrollIntoView({ block: "center", inline: "center" });
    el.click();
    await sleep(900);
    const img = document.querySelector("#imgmain2");
    const url = img?.currentSrc || img?.src || "";
    if (url && !seen.has(url)) {
      seen.add(url);
      console.log(JSON.stringify({ page: i + 1, imgmain2_url: url }));
    }
  }
})();
