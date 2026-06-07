CXX      := g++
CXXFLAGS := -std=c++17 -O2 -Wall -Wextra -MMD -MP

SRC := src/main.cpp src/cpu.cpp
OBJ := $(SRC:src/%.cpp=build/%.o)
DEP := $(OBJ:.o=.d)
BIN := build/emu

all: $(BIN)

$(BIN): $(OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $(OBJ)

build/%.o: src/%.cpp | build
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build:
	mkdir -p build

test: $(BIN)
	bash tests/run_oracle.sh

clean:
	rm -rf build

.PHONY: all test clean
-include $(DEP)
