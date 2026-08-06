<bopli lang="json">
{
    "name": "Home",
    "slots": {}
}
</bopli>

<script setup>
defineProps({
    site: { type: Object, required: true },
    page: { type: Object, required: true },
});
</script>

<template>
    <main>
        <h1>{{ page.title }}</h1>
        <p>{{ site.tagline }}</p>
    </main>
</template>

<style scoped>
main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 5rem 1.5rem;
    font-family: system-ui, sans-serif;
}
</style>
