CXX      := g++
CXXFLAGS := -std=c++17 -O2 -Wall -Wextra -MMD -MP

SRC := main.cpp circ.cpp xml.cpp
OBJ := $(SRC:%.cpp=build/%.o)
DEP := $(OBJ:.o=.d)
BIN := build/sim

all: $(BIN)

$(BIN): $(OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $(OBJ)

build/%.o: %.cpp | build
	$(CXX) $(CXXFLAGS) -c -o $@ $<

build:
	mkdir -p build

clean:
	rm -rf build

.PHONY: all clean
-include $(DEP)
