/** Plugins（对应 Elements）：左侧依赖树，右侧选中插件的详情与操作（对应 Styles 窗格） */
import type { PluginID } from "@bbblank/sdk";
import { SIDELOAD_PREFIX } from "@bbblank/host-dom";
import type { PluginInfo } from "@bbblank/host-dom";
import {
  describeError,
  h,
  replace,
  splitWidget,
  statusDot,
  textButton,
  toolbar,
  toolbarText,
  treeOutline,
} from "@bbblank/devtools-ui";
import type { Child, TreeNode } from "@bbblank/devtools-ui";
import type { DevtoolsModel } from "@bbblank/devtools-ui";
import type { DeveloperRegistry } from "../developer";
import type { Panel } from "./panel";

const section = (title: string, ...body: ReadonlyArray<Child>) =>
  h("div", { class: "section" }, h("div", { class: "section-title" }, title), h("div", { class: "section-body" }, ...body));

const kv = (rows: ReadonlyArray<readonly [string, Child]>) =>
  h("dl", { class: "kv" }, rows.flatMap(([k, v]) => [h("dt", null, k), h("dd", null, v)]));

const list = (items: ReadonlyArray<Child>) => (items.length ? h("div", null, items.map((i) => h("div", null, i))) : h("span", { class: "dim" }, "无"));

export const pluginsPanel = (model: DevtoolsModel, self: string, developers: DeveloperRegistry): Panel => {
  const counts = toolbarText("");
  const split = splitWidget();
  const tree = treeOutline();
  /** 开发插件（经 DevtoolsDeveloper 登记，如 Playground 的草稿）：不在 Market 中展示，只能在此安装 */
  const developer = h("div", { class: "section developer-section" });
  split.main.append(tree, developer);
  const el = h("div", { class: "panel" }, toolbar(counts), split);

  let selected: string | undefined = self;
  /** 停用前确认级联范围 */
  let confirming: string | undefined;
  let busy = false;
  let error: string | undefined;
  /** 由本面板级联停用的依赖者：被停用的插件 → 依赖者（按停用顺序） */
  const cascaded = new Map<string, ReadonlyArray<PluginID>>();

  tree.onPick = (key) => {
    selected = key;
    confirming = undefined;
    error = undefined;
    render();
  };

  const run = async (op: () => Promise<void>) => {
    busy = true;
    error = undefined;
    confirming = undefined;
    render();
    try {
      await op();
    } catch (e) {
      error = describeError(e);
    } finally {
      busy = false;
      render();
    }
  };

  const buildTree = (): ReadonlyArray<TreeNode> => {
    const installed = new Set(model.plugins.map((p) => p.id));
    const node = (p: PluginInfo): TreeNode => ({
      key: p.id,
      label: [
        statusDot(p.status),
        h("span", null, p.name),
        h("span", { class: "dim mono" }, `${p.id}${p.version ? `@${p.version}` : ""}`),
        p.id.startsWith(SIDELOAD_PREFIX) ? h("span", { class: "chip" }, "开发中") : null,
      ],
      children: model.plugins.filter((c) => c.dependencies.some((d) => d.id === p.id)).map(node),
    });
    return model.plugins.filter((p) => !p.dependencies.some((d) => installed.has(d.id))).map(node);
  };

  const details = (p: PluginInfo) => {
    const dependents = model.dependentsOf(p.id);
    const isSelf = p.id === self;
    const enabled = p.status === "enabled";
    const order = enabled ? model.disableOrder(p.id) : [];
    const cascade = order.filter((x) => x !== p.id);
    const disableAll = () =>
      run(async () => {
        for (const x of order) await model.pm.disable(x);
        if (cascade.length) cascaded.set(p.id, cascade);
      });
    // 与内核故障重启时「恢复被级联停用的依赖者」一致：重新启用时按停用的逆序恢复
    const restore = (cascaded.get(p.id) ?? []).filter((x) => model.byId(x)?.status === "disabled");
    const enableAll = () =>
      run(async () => {
        await model.pm.enable(p.id);
        for (const x of [...restore].reverse()) await model.pm.enable(x);
        cascaded.delete(p.id);
      });
    const toggle = () => {
      if (!enabled) return enableAll();
      if (cascade.length && confirming !== p.id) {
        confirming = p.id;
        return render();
      }
      return disableAll();
    };
    return [
      h(
        "div",
        { class: "section-title" },
        h("span", { class: "chip" }, statusDot(p.status), p.status),
        "\u00a0",
        p.name,
      ),
      h(
        "div",
        { class: "actions" },
        textButton(enabled ? "停用" : "启用", toggle, { disabled: busy || (isSelf && enabled), primary: !enabled }),
        textButton("卸载", () => run(() => model.pm.uninstall(p.id)), { disabled: busy || isSelf }),
      ),
      isSelf ? h("div", { class: "banner warning" }, "devtools 不能停用或卸载自身。") : null,
      !enabled && restore.length
        ? h("div", { class: "banner warning" }, `启用后将一并恢复此前被级联停用的：${restore.join("、")}。`)
        : null,
      confirming === p.id
        ? h(
            "div",
            { class: "banner warning" },
            `${cascade.join("、")} 依赖 ${p.id}，将按 ${order.join(" → ")} 的顺序依次停用。`,
            h(
              "div",
              { class: "actions" },
              textButton("确认停用", disableAll, { primary: true }),
              textButton("取消", () => {
                confirming = undefined;
                render();
              }),
            ),
          )
        : null,
      error ? h("div", { class: "banner error" }, error) : null,
      section(
        "常规",
        kv([
          ["ID", h("span", { class: "mono" }, p.id)],
          ["版本", p.version ?? "未知"],
          ["类型", p.kind ?? "未知"],
          ["状态", p.status],
          ["重启次数", String(p.restarts)],
        ]),
      ),
      section(
        "依赖",
        list(
          p.dependencies.map((d) => {
            const dep = model.byId(d.id);
            return h(
              "span",
              { class: "mono" },
              dep ? statusDot(dep.status) : statusDot("failed"),
              ` ${d.id} `,
              h("span", { class: "dim" }, d.range),
              dep ? null : h("span", { class: "error-text" }, " 未安装"),
            );
          }),
        ),
      ),
      section("被依赖", list(dependents.map((d) => h("span", { class: "mono" }, statusDot(d.status), ` ${d.id}`)))),
      section("能力", list(p.capabilities.map((c) => h("span", { class: "mono" }, c)))),
      section("提供服务", list(p.provides.map((s) => h("span", { class: "mono" }, s)))),
      p.lastError
        ? section("最近错误", h("div", { class: "error-text mono" }, `${p.lastError.tag}: ${p.lastError.message}`))
        : null,
    ];
  };

  /** 开发插件安装失败的原因：此时尚无选中项，错误显示在分组内 */
  let developerError: { readonly id: string; readonly message: string } | undefined;

  const renderDeveloper = () => {
    const entries = developers.list().filter((e) => !model.byId(e.id));
    developer.hidden = entries.length === 0;
    replace(
      developer,
      h("div", { class: "section-title" }, "可安装（仅开发者）"),
      h(
        "div",
        { class: "section-body" },
        entries.map((e) =>
          h(
            "div",
            { class: "developer-entry" },
            h("span", null, e.name),
            h("span", { class: "dim mono" }, e.id),
            h("span", { class: "dim" }, e.description ?? `来自 ${e.source}`),
            textButton(
              "安装",
              () =>
                run(async () => {
                  developerError = undefined;
                  try {
                    await e.install();
                    selected = e.id;
                  } catch (err) {
                    // 登记方抛出的普通 Error（如编译失败）直接显示 message；内核错误（带 _tag）展开字段
                    const plain = err instanceof Error && !("_tag" in err);
                    developerError = { id: e.id, message: plain ? err.message : describeError(err) };
                  }
                }),
              { disabled: busy },
            ),
          ),
        ),
        developerError && entries.some((e) => e.id === developerError!.id)
          ? h("div", { class: "error-text" }, `${developerError.id}：${developerError.message}`)
          : null,
      ),
    );
  };

  const render = () => {
    renderDeveloper();
    const enabled = model.plugins.filter((p) => p.status === "enabled").length;
    counts.textContent = `${model.plugins.length} 个插件 · ${enabled} 个已启用`;
    if (selected && !model.byId(selected)) selected = undefined;
    tree.update(buildTree(), selected);
    const p = selected ? model.byId(selected) : undefined;
    replace(split.sidebar, p ? details(p) : h("div", { class: "empty" }, "选择一个插件以查看详情"));
  };

  return {
    id: "plugins",
    title: "Plugins",
    el,
    update: (what) => {
      if (what !== "activity") render();
    },
  };
};
