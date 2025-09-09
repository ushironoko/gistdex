<template>
  <div class="hello-world">
    <h1>{{ title }}</h1>
    <p>Count: {{ count }}</p>
    <button @click="increment">Increment</button>
    <ul>
      <li v-for="item in items" :key="item.id">
        {{ item.name }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

interface Item {
  id: number;
  name: string;
}

const _title = ref("Hello Vue 3");
const count = ref(0);
const _items = ref<Item[]>([
  { id: 1, name: "Item 1" },
  { id: 2, name: "Item 2" },
  { id: 3, name: "Item 3" },
]);

const _increment = () => {
  count.value++;
};

const _doubleCount = computed(() => count.value * 2);
</script>

<style scoped>
.hello-world {
  font-family: Arial, sans-serif;
  padding: 20px;
}

h1 {
  color: #42b883;
}

button {
  background-color: #42b883;
  color: white;
  border: none;
  padding: 10px 20px;
  cursor: pointer;
}

button:hover {
  background-color: #35a372;
}
</style>