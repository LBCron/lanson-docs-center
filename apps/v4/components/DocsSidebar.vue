<script setup lang="ts">
import type { ContentNavigationItem } from '@nuxt/content'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/registry/new-york-v4/ui/sidebar'

defineProps<{
  tree: ContentNavigationItem
}>()

const EXCLUDED_SECTIONS: string[] = []
const EXCLUDED_PAGES: string[] = []

const { path } = toRefs(useRoute())
</script>

<template>
  <Sidebar
    class="sticky top-[calc(var(--header-height)+0.6rem)] z-30 hidden h-[calc(100svh-10rem)] overflow-hidden overscroll-none bg-transparent [--sidebar-menu-width:--spacing(56)] lg:flex"
    collapsible="none"
  >
    <SidebarContent class="w-(--sidebar-menu-width) scroll-fade scrollbar-none overflow-x-hidden pl-2.5 pt-6">
      <SidebarGroup
        v-for="item in tree.children?.filter(section => !EXCLUDED_SECTIONS.includes(section.title.toLocaleLowerCase()))"
        :key="item.title"
      >
        <SidebarGroupLabel class="font-medium text-muted-foreground">
          {{ item.title }}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu class="gap-0.5">
            <template
              v-for="childItem in item?.children?.filter(child => !EXCLUDED_PAGES.includes(child.path))"
              :key="String(childItem.url)"
            >
              <SidebarMenuItem>
                <SidebarMenuButton
                  as-child
                  :is-active="childItem?.path === path"
                  class="relative min-h-[30px] h-auto w-fit overflow-visible border border-transparent py-1 text-[0.8rem] leading-snug font-medium after:absolute after:inset-x-0 after:-inset-y-0.5 after:z-0 after:rounded-md data-[active=true]:border-accent data-[active=true]:bg-accent 3xl:fixed:w-full 3xl:fixed:max-w-48"
                >
                  <NuxtLink :to="childItem?.path">
                    <span class="absolute inset-0 flex w-(--sidebar-width) bg-transparent" />
                    {{ childItem.title }}
                    <span
                      v-if="childItem.new"
                      class="flex size-2 rounded-full bg-green-500"
                      title="New"
                    />
                  </NuxtLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </template>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      <div class="from-background via-background/80 to-background/50 sticky -bottom-1 z-10 h-16 shrink-0 bg-gradient-to-t blur-xs" />
    </SidebarContent>
  </Sidebar>
</template>
