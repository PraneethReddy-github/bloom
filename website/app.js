document.addEventListener("DOMContentLoaded", async () => {
  const repo = "Praneethreddy-github/bloom";
  const btnWin = document.getElementById("btn-win");
  const btnLinuxDeb = document.getElementById("btn-linux-deb");
  const btnLinuxAppImage = document.getElementById("btn-linux-appimage");
  const releaseInfo = document.getElementById("release-info");
  const loading = document.getElementById("loading");
  const btnGroup = document.getElementById("download-buttons");
  const errorMsg = document.getElementById("error-msg");

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
    
    if (!response.ok) {
      throw new Error("Failed to fetch release");
    }
    
    const data = await response.json();
    const version = data.tag_name;
    const assets = data.assets;

    let winUrl = "";
    let linuxDebUrl = "";
    let linuxAppImageUrl = "";

    assets.forEach(asset => {
      const name = asset.name.toLowerCase();
      if (name.endsWith('.exe')) {
        winUrl = asset.browser_download_url;
      } else if (name.endsWith('.deb')) {
        linuxDebUrl = asset.browser_download_url;
      } else if (name.endsWith('.appimage')) {
        linuxAppImageUrl = asset.browser_download_url;
      }
    });

    if (winUrl) {
      btnWin.href = winUrl;
    } else {
      btnWin.style.display = 'none';
    }

    if (linuxDebUrl) {
      btnLinuxDeb.href = linuxDebUrl;
    } else {
      btnLinuxDeb.style.display = 'none';
    }

    if (linuxAppImageUrl) {
      btnLinuxAppImage.href = linuxAppImageUrl;
    } else {
      btnLinuxAppImage.style.display = 'none';
    }

    releaseInfo.textContent = `Latest version: ${version} (${new Date(data.published_at).toLocaleDateString()})`;
    
    loading.classList.add("hidden");
    btnGroup.classList.remove("hidden");
  } catch (error) {
    console.error("Error fetching release:", error);
    loading.classList.add("hidden");
    errorMsg.classList.remove("hidden");
  }
});
