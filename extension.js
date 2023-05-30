// 模块'vscode'包含VS Code可扩展性API
// 导入模块，并在下面的代码中使用别名vscode引用它
const vscode = require("vscode");
const path = require("path");
const moment = require("moment");
const fs = require("fs");
const axios = require("axios");
const { spawn } = require("child_process");
const https = require("https");

var uploaded = false;
var isSuccess = false;
const config = vscode.workspace.getConfiguration("lsky");
// 当你的扩展被激活时，这个方法被调用
// 第一次执行命令时激活扩展名

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  console.log("恭喜你，你的扩展“lsky-upload”现在是活跃的!");
  let disposable = vscode.commands.registerCommand("lsky-upload", function () {
    uploaded = false;
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "Progress",
        cancellable: true,
      },
      (progress) => {
        return new Promise((resolve) => {
          uploaded = false;
          saveImg(progress);
          var intervalObj = setInterval(() => {
            if (uploaded) {
              setTimeout(() => {
                clearInterval(intervalObj);
                resolve();
              }, 1000);
            }
          }, 1000);
        });
      }
    );
  });

  let replaceImgUrlDisposable = vscode.commands.registerCommand(
    "replace-imgurl",
    () => {
      uploaded = false;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Progress",
          cancellable: true,
        },
        (progress) => {
          return new Promise((resolve) => {
            uploaded = false;
            replaceImgUrl(progress);
            var intervalObj = setInterval(() => {
              if (uploaded) {
                setTimeout(() => {
                  clearInterval(intervalObj);
                  resolve();
                }, 1000);
              }
            }, 1000);
          });
        }
      );
    }
  );

  let conversionImageFormatDisposable = vscode.commands.registerCommand(
    "conversion-image-format",
    () => {
      isSuccess = false;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Progress",
          cancellable: true,
        },
        (progress) => {
          return new Promise((resolve) => {
            isSuccess = false;
            conversionImageFormat(progress);
            var intervalObj = setInterval(() => {
              if (isSuccess) {
                setTimeout(() => {
                  clearInterval(intervalObj);
                  resolve();
                }, 1000);
              }
            }, 1000);
          });
        }
      );
    }
  );

  let clearReferenceLinkDisposable = vscode.commands.registerCommand(
    "clear-reference-link",
    () => {
      isSuccess = false;
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Progress",
          cancellable: true,
        },
        (progress) => {
          return new Promise((resolve) => {
            isSuccess = false;
            clearReferenceLink(progress);
            var intervalObj = setInterval(() => {
              if (isSuccess) {
                setTimeout(() => {
                  clearInterval(intervalObj);
                  resolve();
                }, 1000);
              }
            }, 1000);
          });
        }
      );
    }
  );

  context.subscriptions.push(disposable);
  context.subscriptions.push(replaceImgUrlDisposable);
  context.subscriptions.push(conversionImageFormatDisposable);
  context.subscriptions.push(clearReferenceLinkDisposable);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};

async function replaceImgUrl(progress) {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No editor is active.");
    return;
  }

  let text = editor.document.getText();
  const regex = /\!\[.*\]\((.*?)\)/gi;
  let match, links;
  let total = 0; // 记录图片的总数
  let replaced = 0; // 记录替换成功的图片数量
  let offset = 0; // 记录替换的总长度
  let promises = []; // 用于并行处理所有替换操作的 Promise 数组

  while ((match = regex.exec(text)) !== null) {
    var imageUrl = match[1];
    var domainList = config["domainList"];
    if (
      domainList !== undefined &&
      domainList !== null &&
      domainList.includes(new URL(imageUrl).hostname)
    ) {
      console.log(`图片 ${imageUrl} 在 domainList 中，跳过`);
      continue;
    }
    console.log(`第 ${total + 1} 张图片地址: ` + imageUrl);
    links = await getNewUrl(total + 1, imageUrl, progress);
    total++;
    if (links) {
      const start = match.index + offset; // 根据替换总长度计算实际位置
      const end = start + match[0].length;
      const range = new vscode.Range(
        editor.document.positionAt(start),
        editor.document.positionAt(end)
      );
      const promise = editor.edit((editBuilder) => {
        editBuilder.replace(range, links.markdown);
      });
      promises.push(promise);
      offset += links.markdown.length - match[0].length; // 记录替换的总长度
      replaced++;
    }
  }

  await Promise.all(promises); // 等待所有替换操作完成
  uploaded = true;
  vscode.window.showInformationMessage(
    `共 ${total} 张图片，成功替换 ${replaced} 张图片`
  );
}

async function conversionImageFormat(progress) {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    progress.report({
      increment: 100,
      message: "当前没有激活编辑器",
    });
    return;
  }

  let text = editor.document.getText();
  let match;
  let total = 0; // 记录图片的总数
  let replaced = 0; // 记录替换成功的图片数量

  // 匹配 Markdown 文件中的图片链接，并提取链接地址和图片描述信息
  const regex = /!\[(.*?)\]\[(.*?)\]/g;
  // let match;
  while ((match = regex.exec(text)) !== null) {
    // 记录总数
    total++;
    const [fullMatch, altText, refId] = match;
    const refRegex = new RegExp(`\\[${refId}\\]:\\s*(.*)`);
    const refMatch = refRegex.exec(text);
    if (refMatch !== null) {
      const imageUrl = refMatch[1];
      const newMatch = `![${altText}](${imageUrl})`;
      text = text.replace(fullMatch, newMatch);
      // 记录替换成功数量
      replaced++;
    }
  }

  //核心代码
  editor.edit((editBuilder) => {
    // 从开始到结束，全量替换
    const end = new vscode.Position(editor.document.lineCount + 1, 0);
    editBuilder.replace(new vscode.Range(new vscode.Position(0, 0), end), text);
  });

  isSuccess = true;
  progress.report({
    increment: 100,
    message: `共 ${total} 个图片规则，成功替换 ${replaced} 个规则`,
  });
}

async function clearReferenceLink(progress) {
  let editor = vscode.window.activeTextEditor;
  if (!editor) {
    progress.report({
      increment: 100,
      message: "当前没有激活编辑器",
    });
    return;
  }

  let text = editor.document.getText();

  // 删除 Markdown 文件中的链接定义
  const refRegex = /\[(.*?)\]:\s*(.*)/g;
  text = text.replace(refRegex, "");

  //核心代码
  editor.edit((editBuilder) => {
    // 从开始到结束，全量替换
    const end = new vscode.Position(editor.document.lineCount + 1, 0);
    editBuilder.replace(new vscode.Range(new vscode.Position(0, 0), end), text);
  });

  isSuccess = true;
  progress.report({
    increment: 100,
    message: `清除 Markdown 文件中的链接定义成功`,
  });
  // vscode.window.showInformationMessage("清除 Markdown 文件中的链接定义成功");
}

async function getNewUrl(imageIndex, imageUrl, progress) {
  //let config = vscode.workspace.getConfiguration('lsky');
  let localPath = config["tempPath"];
  if (localPath && localPath.length !== localPath.trim().length) {
    progress.report({
      increment: 100,
      message: `本地临时保存图片路径未定义 ${localPath}`,
    });
    return;
  }
  let imagePath = "";
  try {
    imagePath = await downloadImage(imageUrl, localPath, progress);
    let links = await lskyUpload(imageIndex, config, imagePath, progress);
    await deleteLocalPict(imagePath);
    return links;
  } catch (err) {
    // 失败则删除图片
    await deleteLocalPict(imagePath);
    // 提示错误信息
    if (err !== undefined) {
      if (err.message === undefined) {
        if (err.data.message !== undefined) {
          progress.report({
            increment: 100,
            message: "上传失败！" + err.data.message,
          });
        } else {
          progress.report({
            increment: 100,
            message: "上传失败！",
          });
        }
      } else {
        progress.report({
          increment: 100,
          message: "上传失败！" + err.message,
        });
      }
    }
    return;
  }
}

function saveImg(progress) {
  // 获取当前编辑文件
  let editor = vscode.window.activeTextEditor;
  if (!editor) return;
  let fileUri = editor.document.uri;
  if (!fileUri) return;
  if (fileUri.scheme === "untitled") {
    progress.report({
      increment: 100,
      message: "需要先保存文件，才能粘贴图片",
    });
    return;
  }
  let selection = editor.selection;
  let selectText = editor.document.getText(selection);
  if (selectText && !/^[\w\-.]+$/.test(selectText)) {
    progress.report({ increment: 100, message: "选择的文本不是可用的文件名" });
    return;
  }
  //let config = vscode.workspace.getConfiguration('lsky');
  let localPath = config["tempPath"];
  if (localPath && localPath.length !== localPath.trim().length) {
    progress.report({
      increment: 100,
      message: `本地临时保存图片路径未定义 ${localPath}`,
    });
    return;
  }
  let filePath = fileUri.fsPath;
  let imagePath = getImagePath(filePath, selectText, localPath);
  createImageDirWithImagePath(imagePath)
    .then(() => saveClipboardImageToFileAndGetPath(imagePath, progress))
    .then((imagePath) => lskyUpload(-1, config, imagePath, progress))
    .then((links) => {
      // console.log(links);
      editor.edit((textEditorEdit) => {
        textEditorEdit.insert(editor.selection.active, links.markdown);
      });
      progress.report({ increment: 100, message: "上传成功！" });
      uploaded = true;
    })
    .then(() => deleteLocalPict(imagePath))
    .catch((err) => {
      // 失败则删除图片
      deleteLocalPict(imagePath);
      if (err === undefined || err === null) {
        progress.report({ increment: 100, message: "上传失败！" });
      } else {
        progress.report({
          increment: 100,
          message: "上传失败！" + err.message,
        });
      }
    });
}

function lskyUpload(imageIndex, config, imagePath, progress) {
  if (imageIndex === -1) {
    progress.report({ increment: 20, message: "图片正在上传到图床..." });
  } else {
    progress.report({
      increment: 20,
      message: `第 ${imageIndex} 张图片地址: ` + imagePath,
    });
  }
  return new Promise(async (resolve, reject) => {
    let token = await getToken(config);
    if (!token || token.length === 0) {
      reject({ message: "token 获取失败" });
    }
    console.log("token=" + token);

    const file = fs.createReadStream(imagePath, { autoClose: true });
    const data = {
      strategy_id: config.strategyId,
      file,
    };
    const url = config.baseUrl + config.uploadPath;
    const auth = "Bearer " + token;
    const headers = {
      Authorization: auth,
      "Content-Type": "multipart/form-data",
      Accept: "application/json",
    };

    try {
      // @ts-ignore
      const res = await axios({
        url,
        method: "POST",
        headers,
        data,
      });

      console.log(res);
      if (res.status === 200) {
        if (Object.keys(res.data.data).length === 0) {
          reject(res);
        }
        resolve(res.data.data.links);
      } else {
        reject(res);
      }
    } catch (err) {
      console.log(err);
      reject(err);
    }
  });
}

async function getToken(config) {
  let token = config.token;
  if (!token) {
    const tokenUrl = config.baseUrl + config.tokenPath;
    console.log(tokenUrl);
    const data = {
      email: config.email,
      password: config.password,
    };

    try {
      // @ts-ignore
      const res = await axios({
        url: tokenUrl,
        method: "POST",
        data,
      });

      console.log(res);
      if (res.status === 200) {
        token = res.data.data.token;
      }
      vscode.workspace.getConfiguration().update("lsky.token", token, true);
    } catch (err) {
      console.log(err);
      token = null;
    }
  }
  return token;
}

function getImagePath(filePath, selectText, localPath) {
  // 图片名称
  let imageFileName = "";
  if (!selectText) {
    imageFileName = moment().format("YMMDDHHmmss") + ".png";
  } else {
    imageFileName = selectText + ".png";
  }

  // 图片本地保存路径
  let folderPath = path.dirname(filePath);
  let imagePath = "";
  if (path.isAbsolute(localPath)) {
    imagePath = path.join(localPath, imageFileName);
  } else {
    imagePath = path.join(folderPath, localPath, imageFileName);
  }
  return imagePath;
}

function createImageDirWithImagePath(imagePath) {
  return new Promise((resolve, reject) => {
    let imageDir = path.dirname(imagePath);
    fs.exists(imageDir, (exists) => {
      if (exists) {
        resolve(imagePath);
        return;
      }
      fs.mkdir(imageDir, (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(imagePath);
      });
    });
  });
}

function saveClipboardImageToFileAndGetPath(imagePath, progress) {
  return new Promise((resolve, reject) => {
    progress.report({ increment: 20, message: "将剪贴板图片保存到本地..." });
    if (!imagePath) {
      reject(new Error("imagePath不能为空！"));
      return;
    }
    let platform = process.platform;
    if (platform === "win32") {
      // Windows
      const scriptPath = path.join(__dirname, "./lib/pc.ps1");
      const powershell = spawn("powershell", [
        "-noprofile",
        "-noninteractive",
        "-nologo",
        "-sta",
        "-executionpolicy",
        "unrestricted",
        "-windowstyle",
        "hidden",
        "-file",
        scriptPath,
        imagePath,
      ]);
      powershell.on("exit", function (code, signal) {
        if (code === 0) {
          console.log("PowerShell command executed successfully.");
        } else {
          console.error(`PowerShell command failed with exit code ${code}.`);
        }
      });
      powershell.stdout.on("data", function (data) {
        resolve(data.toString().trim());
      });
      powershell.on("error", (err) => {
        console.error("Failed to start PowerShell.", err);
      });
    } else if (platform === "darwin") {
      // Mac
      let scriptPath = path.join(__dirname, "./lib/mac.applescript");

      let ascript = spawn("osascript", [scriptPath, imagePath]);
      ascript.on("exit", function (code, signal) {});

      ascript.stdout.on("data", function (data) {
        resolve(data.toString().trim());
      });
    } else {
      // Linux

      let scriptPath = path.join(__dirname, "./lib/linux.sh");

      let ascript = spawn("sh", [scriptPath, imagePath]);
      ascript.on("exit", function (code, signal) {});

      ascript.stdout.on("data", function (data) {
        let result = data.toString().trim();
        if (result == "no xclip") {
          reject(new Error("需要先安装 xclip 命令！"));
          return;
        }
        resolve(result);
      });
    }
  });
}

function isUrl(str) {
  return /[a-zA-z]+:\/\/[^\s]*/.test(str);
}

// 递归创建目录 同步方法
function mkdirsSync(dirname) {
  if (fs.existsSync(dirname)) {
    return true;
  } else {
    if (mkdirsSync(path.dirname(dirname))) {
      fs.mkdirSync(dirname);
      return true;
    }
  }
}

async function downloadImage(imageUrl, localPath, progress) {
  // 获取当前编辑文件
  let editor = vscode.window.activeTextEditor;
  if (!editor) return "";
  let fileUri = editor.document.uri;
  if (!fileUri) return "";
  if (fileUri.scheme === "untitled") {
    progress.report({
      increment: 100,
      message: "需要先保存文件，才能批量上传图片",
    });
    return "";
  }
  // @ts-ignore
  if (!isUrl(imageUrl)) {
    // 图片本地保存路径
    let filePath = fileUri.fsPath;
    let folderPath = path.dirname(filePath);
    let imagePath = "";
    if (path.isAbsolute(imageUrl)) {
      imagePath = path.join(localPath, imageUrl);
    } else {
      imagePath = path.join(folderPath, "/", imageUrl);
    }
    return imagePath;
  }
  const response = await axios({
    url: imageUrl,
    method: "GET",
    responseType: "stream",
    headers: {
      Accept: "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });

  const contentType = response.headers["content-type"];
  // 判断是否是图片
  if (!contentType.startsWith("image/")) {
    return "";
  }

  let extension = ".png"; // 默认后缀为 .jpg
  if (contentType.startsWith("image/")) {
    extension = "." + contentType.substring("image/".length);
  }

  const imageFileName = moment().format("YMMDDHHmmss") + extension;
  // 图片本地保存路径
  let filePath = fileUri.fsPath;
  let folderPath = path.dirname(filePath);
  let imagePath = "";
  if (path.isAbsolute(localPath)) {
    folderPath = localPath;
    imagePath = path.join(localPath, imageFileName);
  } else {
    folderPath = path.join(folderPath, localPath);
    imagePath = path.join(folderPath, imageFileName);
  }

  // 创建文件夹
  mkdirsSync(folderPath);

  const writer = fs.createWriteStream(imagePath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", () => {
      resolve(imagePath);
    });

    writer.on("error", reject);
  });
}

async function deleteLocalPict(imagePath) {
  const _fs = require("fs").promises;
  if (config.keepLocalPict === false) {
    let stat = await _fs.stat(imagePath);
    if (stat.isFile()) {
      await _fs.unlink(imagePath);
    }
  }
}
