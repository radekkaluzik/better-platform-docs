import data from "./config.json" assert { type: "json" };
import follow from "follow-redirects";
import StreamZip from "node-stream-zip";
import fs from "fs";
import fse from "fs-extra";
import glob from "glob";
import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import transformers from "./transformers.mjs";

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

const dir = "./tmp";

if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}

const safePath = (location) => {
  return path.resolve(__dirname, location.replaceAll("//", "/"));
};

function githubTemplate(owner, repository, branch) {
  return `https://github.com/${owner}/${repository}/archive/refs/heads/${branch}.zip`;
}

function gitlabTemplate(owner, repository, branch) {
  return `https://gitlab.cee.redhat.com/${owner}/${repository}/-/archive/${branch}/${repository}-${branch}.zip`;
}

const sourceMapper = {
  github: githubTemplate,
  gitlab: gitlabTemplate,
};

data.forEach(
  ({ owner, repository, branch, path, title, source = "github" }) => {
    console.log(`Repository: ${owner}/${repository}`);
    const onGenerate = () => {
      if (title === "public") {
        console.log(
          "Extracting to public folder: ",
          `${safePath(`../tmp/${repository}-${branch}/${path}`)}`
        );
        exec(
          `cp -r ${safePath(
            `../tmp/${repository}-${branch}/${path}`
          )} ${safePath("../public")}`
        );
      } else if (title === "examples") {
        console.log(
          "Extracting to components folder: ",
          `${safePath(`../tmp/${repository}-${branch}/${path}`)}`
        );
        exec(
          `rsync -a -v ${safePath(
            `../tmp/${repository}-${branch}/${path}`
          )} ${safePath("../components")}`
        );
      } else {
        console.log(
          `Extracting`,
          `${safePath(`../tmp/${repository}-${branch}/${path}`)}`,
          `to ${safePath(
            `../pages/${title.replaceAll(" ", "-").toLowerCase()}`
          )}`
        );
        const pagesDir = `./pages/${title.replaceAll(" ", "-").toLowerCase()}`;
        exec(
          `rsync -a -u -v --prune-empty-dirs --exclude '*.xml' --exclude '*.adoc' --exclude '*.png.cache' ${safePath(
            `../tmp/${repository}-${branch}/${path}`
          )} ${safePath(
            `../pages/${title.replaceAll(" ", "-").toLowerCase()}`
          )}`,
          (error) => {
            if (error) {
              console.log(error);
            }
            const imagesInPages = glob.sync(`${pagesDir}/**/*.png`);
            imagesInPages.forEach((image) => {
              const imageName = image.replace("/pages/", "/public/");
              let imgDirname = imageName.split("/");
              imgDirname.pop();
              imgDirname = imgDirname.join("/");
              fse.ensureDirSync(imgDirname);
              fse.renameSync(image, imageName);
            });
          }
        );
      }
    };
    if (fs.existsSync(safePath(`../tmp/${repository}-${branch}`))) {
      console.log("folder exists!");
      transformers[repository]?.({ repository, branch, path, title });
      onGenerate();
    } else {
      console.log(
        "Downloading files",
        `https://github.com/${owner}/${repository}/archive/refs/heads/${branch}.zip`
      );
      const file = fs.createWriteStream(safePath(`../tmp/${repository}.zip`));
      follow.https.get(
        sourceMapper[source](owner, repository, branch),
        {
          // required for gitlab self signed certificate
          rejectUnauthorized: source !== "gitlab",
        },
        function (response) {
          console.log("Status: ", response.statusCode);
          response.pipe(file);
          file.on("finish", () => {
            file.close();
            const zip = new StreamZip.async({
              file: `./tmp/${repository}.zip`,
            });
            zip.extract(null, safePath("../tmp")).then(() => {
              transformers[repository]?.({ repository, branch, path, title });
              onGenerate();
              zip.close();
            });
          });
        }
      );
    }
  }
);

// data.forEach(
//   ({ owner, repository, branch, path, title, source = "github" }) => {
//     const onGenerate = () => {
//       if (title === "public") {
//         exec(`cp -r /tmp/${repository}-${branch}/${path} ./public`);
//       } else if (title === "examples") {
//         exec(`rsync -a -v /tmp/${repository}-${branch}/${path} ./components`);
//       } else {
//         exec(
//           `rsync -a -v --exclude '*.xml' --exclude '*.adoc' /tmp/${repository}-${branch}/${path} ./pages/${title
//             .replaceAll(" ", "-")
//             .toLowerCase()}`
//         );
//       }
//     };
//     if (fs.existsSync(`/tmp/${repository}-${branch}`)) {
//       console.log("folder exists!");
//       transformers[repository]?.({ repository, branch, path });
//       onGenerate();
//     } else {
//       console.log(`Downloading ${owner}, ${repository}`);
//       const file = fs.createWriteStream(`/tmp/${repository}.zip`);
//       follow.https.get(
//         sourceMapper[source](owner, repository, branch),
//         {
//           // required for gitlab self signed certificate
//           rejectUnauthorized: source !== "gitlab",
//         },
//         async function (response) {
//           response.pipe(file);
//           file.on("finish", async () => {
//             file.close();
//             const zip = new StreamZip.async({ file: `/tmp/${repository}.zip` });
//             await zip.extract(null, "/tmp");
//             transformers[repository]?.({ repository, branch, path });
//             onGenerate();
//           });
//         }
//       );
//     }
//   }
// );
