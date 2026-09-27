export type ExperienceTheme = {
  colors: {
    primary: string;
    accent?: string;
    surface?: string;
  };
};

export type ExperienceSection = {
  type: string;
  config: Record<string, unknown>;
};

export type ExperiencePage = {
  id: string;
  name: string;
  slug: string;
  sections: ExperienceSection[];
  valid: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ExperienceSite = {
  id: string;
  organizationId: string;
  outletId: string;
  name: string;
  theme: ExperienceTheme;
  currentVersion: string;
  publishedVersion?: string;
  pages: ExperiencePage[];
  navbar: {
    logo: boolean;
    menu: boolean;
    reservation: boolean;
    account: boolean;
    mobile: { collapsed: boolean };
  };
  css?: string;
  createdAt: Date;
  updatedAt: Date;
};

export class CustomerExperienceService {
  private readonly sites = new Map<string, ExperienceSite>();

  public createExperience(input: {
    id: string;
    organizationId: string;
    outletId: string;
    name: string;
    theme: ExperienceTheme;
  }): ExperienceSite {
    const site: ExperienceSite = {
      id: input.id,
      organizationId: input.organizationId,
      outletId: input.outletId,
      name: input.name,
      theme: input.theme,
      currentVersion: "v1",
      pages: [],
      navbar: {
        logo: true,
        menu: true,
        reservation: true,
        account: true,
        mobile: { collapsed: true },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.sites.set(site.id, site);
    return site;
  }

  public addPage(siteId: string, input: { id: string; name: string; slug: string; sections: ExperienceSection[] }): ExperiencePage & { valid: boolean } {
    const site = this.sites.get(siteId);
    if (!site) {
      const now = new Date();
      return { id: input.id, name: input.name, slug: input.slug, sections: input.sections, valid: false, createdAt: now, updatedAt: now };
    }

    const valid = !/^javascript:/i.test(input.slug) && !/script/i.test(input.slug);
    const page: ExperiencePage = {
      id: input.id,
      name: input.name,
      slug: input.slug,
      sections: input.sections,
      valid,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    if (!valid) {
      return { ...page, valid: false };
    }

    site.pages.push(page);
    site.updatedAt = new Date();
    return { ...page, valid: true };
  }

  public reorderSection(pageId: string, sectionType: string, index: number): ExperiencePage | undefined {
    const site = Array.from(this.sites.values()).find((entry) => entry.pages.some((page) => page.id === pageId));
    if (!site) {
      return undefined;
    }
    const page = site.pages.find((entry) => entry.id === pageId);
    if (!page) {
      return undefined;
    }
    const target = page.sections.findIndex((section) => section.type === sectionType);
    if (target === -1) {
      return page;
    }
    const [removed] = page.sections.splice(target, 1);
    page.sections.splice(index, 0, removed);
    page.updatedAt = new Date();
    return page;
  }

  public saveVersion(siteId: string, input: { label?: string; published?: boolean }): { siteId: string; label: string; version: string; published: boolean } {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error(`Experience site not found: ${siteId}`);
    }
    const nextVersion = site.currentVersion === "v1" ? "v1" : `v${site.pages.length + 1}`;
    site.currentVersion = nextVersion;
    if (input.published) {
      site.publishedVersion = nextVersion;
    }
    site.updatedAt = new Date();
    return { siteId, label: input.label ?? "Saved version", version: nextVersion, published: input.published ?? false };
  }

  public updateNavbar(siteId: string, input: { logo: boolean; menu: boolean; reservation: boolean; account: boolean; mobile: { collapsed: boolean } }): { logo: boolean; menu: boolean; reservation: boolean; account: boolean; mobile: { collapsed: boolean } } {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error(`Experience site not found: ${siteId}`);
    }
    site.navbar = {
      logo: input.logo,
      menu: input.menu,
      reservation: input.reservation,
      account: input.account,
      mobile: { collapsed: input.mobile.collapsed },
    };
    site.updatedAt = new Date();
    return site.navbar;
  }

  public setCustomCss(siteId: string, css: string): { allowed: boolean; reason?: string } {
    const site = this.sites.get(siteId);
    if (!site) {
      throw new Error(`Experience site not found: ${siteId}`);
    }
    const unsafe = /javascript:/i.test(css) || /expression\s*\(/i.test(css) || /<script/i.test(css);
    if (unsafe) {
      return { allowed: false, reason: "Unsafe custom CSS rejected" };
    }
    site.css = css;
    site.updatedAt = new Date();
    return { allowed: true };
  }
}
