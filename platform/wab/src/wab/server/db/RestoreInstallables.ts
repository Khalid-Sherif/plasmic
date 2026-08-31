import { loadConfig } from "@/wab/server/config";
import { ensureDbConnection } from "@/wab/server/db/DbCon";
import { DbMgr, SUPER_USER } from "@/wab/server/db/DbMgr";
import { logger } from "@/wab/server/observability";
import { getBundleInfo } from "@/wab/server/pkg-mgr";
import { defaultComponentKinds } from "@/wab/shared/core/components";
import { PLEXUS_INSERTABLE_ID } from "@/wab/shared/insertables";
import { kebabCase, startCase } from "lodash";

async function main() {
  const config = loadConfig();
  const con = await ensureDbConnection(config.databaseUri, "default");
  await con.transaction(async (em) => {
    const db = new DbMgr(em, SUPER_USER);
    const plexusBundleInfo = getBundleInfo(PLEXUS_INSERTABLE_ID);

    await db.setDevFlagOverrides(
      JSON.stringify(
        {
          plexus: true,
          installables: [
            {
              type: "ui-kit",
              isInstallOnly: true,
              isNew: true,
              name: "Plasmic Design System",
              projectId: plexusBundleInfo.projectId,
              imageUrl: "https://static1.plasmic.app/plasmic-logo.png",
              entryPoint: {
                type: "arena",
                name: "Components",
              },
            },
          ],
          insertableTemplates: {
            type: "insertable-templates-group",
            name: "root",
            items: [
              {
                type: "insertable-templates-group",
                name: "Components",
                items: Object.keys(defaultComponentKinds).map((item) => ({
                  componentName: startCase(item),
                  templateName: `${plexusBundleInfo.sysname}/${kebabCase(
                    item
                  )}`,
                  imageUrl: `https://static1.plasmic.app/insertables/${kebabCase(
                    item
                  )}.svg`,
                  type: "insertable-templates-component",
                  projectId: plexusBundleInfo.projectId,
                  tokenResolution: "reuse-by-name",
                })),
              },
            ].filter((g) => g.items.length > 0),
          },
          insertPanelContent: {
            aliases: {
              dataFetcher: "builtincc:plasmic-data-source-fetcher",
              pageMeta: "builtincc:hostless-plasmic-head",
              ...Object.keys(defaultComponentKinds).reduce((acc, k) => {
                acc[k] = `default:${k}`;
                return acc;
              }, {}),
            },
            builtinSections: {
              Home: {
                Basic: [
                  "text",
                  "heading",
                  "link",
                  "linkContainer",
                  "section",
                  "columns",
                  "vstack",
                  "hstack",
                  "grid",
                  "box",
                  "image",
                  "icon",
                ],
                "Customizable components": Object.keys(defaultComponentKinds),
                Advanced: ["pageMeta", "dataFetcher"],
              },
            },
            builtinSectionsInstallables: {
              "Customizable components": plexusBundleInfo.projectId,
            },
          },
        },
        null,
        2
      )
    );
    logger().info("Restored installables devflag override");
  });
}

main()
  .then(() => {
    logger().info("done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
